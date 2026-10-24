from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.customer import Customer
from app.models.organization import Organization
from app.core.deps import get_current_user, require_role
from app.core.geocoding import geocode_address
from app.config import settings
from app.schemas.auth import CurrentUser
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerOut

router = APIRouter()


def _get_customer_or_404(db: Session, customer_id: int, organization_id: int) -> Customer:
    """
    The organization_id filter here IS the tenant isolation boundary —
    a customer from another org simply doesn't exist as far as this
    query is concerned, so it 404s instead of 403ing (never reveal that
    a record exists in someone else's tenant).
    """
    customer = (
        db.query(Customer)
        .filter(Customer.id == customer_id, Customer.organization_id == organization_id)
        .first()
    )
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    if payload.latitude is not None and payload.longitude is not None:
        # Frontend already resolved + let the user drag-adjust the pin —
        # trust that over re-geocoding the address text ourselves.
        latitude, longitude = payload.latitude, payload.longitude
    else:
        geocoded = geocode_address(payload.address)
        latitude, longitude = geocoded.latitude, geocoded.longitude

    geofence_radius_m = payload.geofence_radius_m
    if geofence_radius_m is None:
        org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
        geofence_radius_m = org.default_geofence_radius_m if org else settings.DEFAULT_GEOFENCE_RADIUS_M

    customer = Customer(
        organization_id=current_user.organization_id,
        name=payload.name,
        address=payload.address,
        latitude=latitude,
        longitude=longitude,
        geofence_radius_m=geofence_radius_m,
        contact_phone=payload.contact_phone,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("", response_model=list[CustomerOut])
def list_customers(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),  # any role, including agent, can view
):
    return (
        db.query(Customer)
        .filter(Customer.organization_id == current_user.organization_id)
        .order_by(Customer.name)
        .all()
    )


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    return _get_customer_or_404(db, customer_id, current_user.organization_id)


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    customer = _get_customer_or_404(db, customer_id, current_user.organization_id)

    if payload.name is not None:
        customer.name = payload.name
    if payload.contact_phone is not None:
        customer.contact_phone = payload.contact_phone
    if payload.geofence_radius_m is not None:
        customer.geofence_radius_m = payload.geofence_radius_m
    if payload.address is not None and payload.address != customer.address:
        customer.address = payload.address
        if payload.latitude is not None and payload.longitude is not None:
            # Pin-adjusted on the frontend — use it directly, skip re-geocoding.
            customer.latitude = payload.latitude
            customer.longitude = payload.longitude
        else:
            # No pin override given — re-geocode so lat/long stay accurate.
            # This is a second Permanent Geocoding charge, same as creation.
            geocoded = geocode_address(payload.address)
            customer.latitude = geocoded.latitude
            customer.longitude = geocoded.longitude
    elif payload.latitude is not None and payload.longitude is not None:
        # Address unchanged, but the manager adjusted the pin anyway (the
        # geocoded point was slightly off even though the text was right).
        customer.latitude = payload.latitude
        customer.longitude = payload.longitude

    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    customer = _get_customer_or_404(db, customer_id, current_user.organization_id)
    db.delete(customer)
    db.commit()
