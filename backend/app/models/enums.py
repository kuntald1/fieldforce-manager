import enum


class UserRole(str, enum.Enum):
    # Vorpet's own staff, not a client's. Belongs to no one company in
    # particular: creates companies, creates their first admin, and can
    # act inside any of them by switching which company their token is
    # issued for (see auth.switch_company).
    superadmin = "superadmin"
    admin = "admin"        # the client company's own top-level user
    manager = "manager"    # supervises a team of agents
    agent = "agent"        # field sales/marketing agent


class RoutePriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class RouteStatus(str, enum.Enum):
    planned = "planned"
    in_progress = "in_progress"
    completed = "completed"


class VisitStatus(str, enum.Enum):
    pending = "pending"
    checked_in = "checked_in"
    completed = "completed"
    missed = "missed"


class ApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ExpenseStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"  # agent withdrew it themselves, while still pending


class AttendanceStatus(str, enum.Enum):
    on_duty = "on_duty"
    off_duty = "off_duty"


class AttachmentKind(str, enum.Enum):
    """What a visit attachment is. Video is deliberately absent: three
    minutes of it is ~22 MB, which a rural upload cannot carry and a
    shared VPS cannot store at any real number of agents."""
    photo = "photo"
    audio = "audio"


class MediaRetention(str, enum.Enum):
    """What happens to a company's photos and recordings over time.
    `automatic` uses the per-company month counts; `never` keeps
    everything, which is the safe default for an existing client whose
    expectations were set before this feature existed."""
    automatic = "automatic"
    never = "never"
