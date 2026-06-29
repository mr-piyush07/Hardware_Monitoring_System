from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import create_access_token
from app.core.config import settings
from app.modules.auth import service, schemas

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=schemas.UserRead)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = service.get_user_by_email(db, email=user_in.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Auto-promote first user to admin
    users_count = db.query(service.models.User).count()
    if users_count == 0:
        user_in.role = "admin"
    
    return service.create_user(db=db, user=user_in)

@router.post("/login", response_model=schemas.Token)
async def login(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = service.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(subject=user.email)
    
    # Track session in Redis
    await service.save_session(
        token=access_token, 
        email=user.email, 
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "role": user.role,
        "full_name": user.full_name
    }

@router.post("/logout")
async def logout(token: str = Depends(service.oauth2_scheme)):
    await service.delete_session(token)
    return {"message": "Successfully logged out"}

# Admin User Management
@router.get("/users", response_model=list[schemas.UserRead])
def list_users(
    db: Session = Depends(get_db), 
    admin: service.models.User = Depends(service.RoleChecker(["admin"]))
):
    return db.query(service.models.User).all()

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int, 
    db: Session = Depends(get_db), 
    admin: service.models.User = Depends(service.RoleChecker(["admin"]))
):
    user = db.query(service.models.User).filter(service.models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}
