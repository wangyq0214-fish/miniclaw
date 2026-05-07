"""
Authentication API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import timedelta
import logging

from database import get_db, get_redis
from models import User
from schemas.auth import UserCreate, UserLogin, UserResponse, Token
from auth.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_active_user,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from config import get_user_workspace_dir, get_user_memory_dir, get_user_sessions_dir

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user.
    """
    # Check if username exists
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Check if email exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    logger.info(f"New user registered: {new_user.username} (user_id={new_user.id})")

    # Initialize user directories
    for d in [get_user_workspace_dir(new_user.id), get_user_memory_dir(new_user.id), get_user_sessions_dir(new_user.id)]:
        d.mkdir(parents=True, exist_ok=True)
    logger.info(f"User directories initialized for user {new_user.id}")

    return new_user


@router.post("/auth/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
    redis = Depends(get_redis)
):
    """
    Login and get access token.
    """
    # Find user
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )

    # Store token in Redis with expiration
    await redis.setex(
        f"token:{user.username}",
        ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        access_token
    )

    logger.info(f"User logged in: {user.username}")

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/auth/logout")
async def logout(
    current_user: User = Depends(get_current_active_user),
    redis = Depends(get_redis)
):
    """
    Logout and invalidate token.
    """
    # Remove token from Redis
    await redis.delete(f"token:{current_user.username}")

    logger.info(f"User logged out: {current_user.username}")
    return {"message": "Successfully logged out"}


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get current user information.
    """
    return current_user
