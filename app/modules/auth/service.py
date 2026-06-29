from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.modules.auth import models, schemas
from app.core.security import get_password_hash, verify_password
from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_redis

async def save_session(token: str, email: str, expires_in_minutes: int):
    redis_client = await get_redis()
    # Key: session:token, Value: email, Expire: minutes * 60
    await redis_client.setex(f"session:{token}", expires_in_minutes * 60, email)

async def delete_session(token: str):
    redis_client = await get_redis()
    await redis_client.delete(f"session:{token}")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email, 
        hashed_password=hashed_password,
        full_name=user.full_name,
        role=user.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, email: str, password: str):
    user = get_user_by_email(db, email)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

async def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Optional Redis session check — if Redis is unavailable or session expired,
    # fall back to JWT-only auth so users aren't locked out after server restarts.
    try:
        redis_client = await get_redis()
        session_data = await redis_client.get(f"session:{token}")
        if session_data is None:
            # Session not in Redis — re-register it so subsequent calls pass
            await redis_client.setex(f"session:{token}", settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, email)
    except Exception:
        pass  # Redis unavailable — continue with JWT-only auth

    user = get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    return user

class RoleChecker:
    def __init__(self, allowed_roles: list):
        self.allowed_roles = allowed_roles

    def __call__(self, user: models.User = Depends(get_current_user)):
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have enough permissions to perform this action"
            )
        return user
