from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_id: int
    login_time: datetime
    logout_time: datetime | None
    status: str
