from pydantic import BaseModel, ConfigDict


class MenuItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
