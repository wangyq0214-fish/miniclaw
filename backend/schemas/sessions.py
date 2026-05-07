
"""
会话管理相关的 Pydantic Schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class SessionCreate(BaseModel):
    """创建会话请求"""
    title: Optional[str] = Field(None, description="会话标题")
    tags: Optional[List[str]] = Field(None, description="会话标签")
    related_resources: Optional[List[int]] = Field(None, description="关联资源ID列表")


class SessionUpdate(BaseModel):
    """更新会话请求"""
    title: Optional[str] = Field(None, description="会话标题")
    status: Optional[str] = Field(None, description="会话状态")
    tags: Optional[List[str]] = Field(None, description="会话标签")


class SessionResponse(BaseModel):
    """会话响应"""
    session_id: str = Field(..., description="会话ID")
    title: str = Field(..., description="会话标题")
    status: str = Field(..., description="会话状态")
    message_count: int = Field(0, description="消息数量")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")
    last_message_at: Optional[datetime] = Field(None, description="最后消息时间")
    tags: Optional[List[str]] = Field(None, description="会话标签")

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    """创建消息请求"""
    role: str = Field(..., description="消息角色: user/assistant/system")
    content: str = Field(..., description="消息内容")
    metadata: Optional[Dict[str, Any]] = Field(None, description="消息元数据")


class MessageResponse(BaseModel):
    """消息响应"""
    role: str = Field(..., description="消息角色")
    content: str = Field(..., description="消息内容")
    timestamp: str = Field(..., description="时间戳")
    metadata: Optional[Dict[str, Any]] = Field(None, description="消息元数据")


class SessionListResponse(BaseModel):
    """会话列表响应"""
    sessions: List[SessionResponse] = Field(..., description="会话列表")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="当前页")
    page_size: int = Field(..., description="每页大小")


class MessageListResponse(BaseModel):
    """消息列表响应"""
    messages: List[MessageResponse] = Field(..., description="消息列表")
    total: int = Field(..., description="总数")
    session_id: str = Field(..., description="会话ID")
