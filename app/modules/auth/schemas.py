from pydantic import BaseModel, EmailStr, Field

class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None

class UserCreate(UserBase):
    password: str = Field(..., max_length=72)
    role: str = "user"

class UserRead(UserBase):
    id: int
    full_name: str | None = None
    is_active: bool
    role: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    full_name: str | None = None

class TokenData(BaseModel):
    email: str | None = None
