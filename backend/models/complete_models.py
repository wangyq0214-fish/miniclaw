"""
完整的数据库模型设计
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum, Float, Date, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


# ==================== 用户相关 ====================

class User(Base):
    """用户基本信息表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)

    # 学生基本信息
    major = Column(String(100), nullable=True, comment="专业")
    grade = Column(String(20), nullable=True, comment="年级")
    student_id = Column(String(50), unique=True, nullable=True, comment="学号")

    # 头像（Base64 存储）
    avatar_data = Column(Text, nullable=True, comment="头像 Base64 数据")
    avatar_type = Column(String(20), nullable=True, comment="头像 MIME 类型")

    # 状态
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

    # 关系
    profile = relationship("StudentProfile", back_populates="user", uselist=False)
    sessions = relationship("ConversationSession", back_populates="user")
    resources = relationship("Resource", back_populates="user")
    learning_progress = relationship("LearningProgress", back_populates="user")

    def __repr__(self):
        return f"<User(id={self.id}, username={self.username})>"


class StudentProfile(Base):
    """学生画像表 - 6个维度的动态画像"""
    __tablename__ = "student_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    # 6个维度的画像数据（使用 JSONB 存储）
    learning_style = Column(JSONB, nullable=True, comment="学习风格画像")
    knowledge_level = Column(JSONB, nullable=True, comment="知识水平画像")
    interest_preference = Column(JSONB, nullable=True, comment="兴趣偏好画像")
    cognitive_ability = Column(JSONB, nullable=True, comment="认知能力画像")
    learning_behavior = Column(JSONB, nullable=True, comment="学习行为画像")
    emotional_state = Column(JSONB, nullable=True, comment="情绪状态画像")

    # 综合画像摘要
    profile_summary = Column(Text, nullable=True, comment="画像摘要")

    # 画像版本和更新
    version = Column(Integer, default=1, comment="画像版本号")
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", back_populates="profile")

    def __repr__(self):
        return f"<StudentProfile(user_id={self.user_id}, version={self.version})>"


# ==================== 会话管理 ====================

class SessionStatus(enum.Enum):
    """会话状态枚举"""
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class ConversationSession(Base):
    """对话会话表"""
    __tablename__ = "conversation_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 会话信息
    session_id = Column(String(100), unique=True, index=True, nullable=False, comment="会话唯一标识")
    title = Column(String(200), nullable=True, comment="会话标题")
    status = Column(SQLEnum(SessionStatus), default=SessionStatus.ACTIVE, comment="会话状态")

    # 上下文信息（存储在 Redis，这里只记录元数据）
    context_key = Column(String(200), nullable=True, comment="Redis 中的上下文 key")
    message_count = Column(Integer, default=0, comment="消息数量")

    # 关联信息
    related_resources = Column(JSONB, nullable=True, comment="关联的资源ID列表")
    tags = Column(JSONB, nullable=True, comment="会话标签")

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_message_at = Column(DateTime(timezone=True), nullable=True)

    # 关系
    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ConversationSession(id={self.id}, session_id={self.session_id})>"


class MessageRole(enum.Enum):
    """消息角色枚举"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Message(Base):
    """消息记录表"""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("conversation_sessions.id"), nullable=False)

    # 消息内容
    role = Column(SQLEnum(MessageRole), nullable=False, comment="消息角色")
    content = Column(Text, nullable=False, comment="消息内容")

    # 元数据
    message_metadata = Column(JSONB, nullable=True, comment="消息元数据（如模型参数、token数等）")

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    session = relationship("ConversationSession", back_populates="messages")

    def __repr__(self):
        return f"<Message(id={self.id}, role={self.role})>"


# ==================== 资源管理 ====================

class ResourceType(enum.Enum):
    """资源类型枚举"""
    VIDEO = "video"
    PPT = "ppt"
    PDF = "pdf"
    IMAGE = "image"
    AUDIO = "audio"
    DOCUMENT = "document"
    ANIMATION = "animation"
    OTHER = "other"


class ResourceStatus(enum.Enum):
    """资源状态枚举"""
    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class Resource(Base):
    """资源索引表"""
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 资源基本信息
    name = Column(String(200), nullable=False, comment="资源名称")
    resource_type = Column(SQLEnum(ResourceType), nullable=False, comment="资源类型")
    status = Column(SQLEnum(ResourceStatus), default=ResourceStatus.PENDING, comment="资源状态")

    # 存储信息
    storage_url = Column(String(500), nullable=True, comment="云存储 URL")
    cdn_url = Column(String(500), nullable=True, comment="CDN 加速 URL")
    file_size = Column(Integer, nullable=True, comment="文件大小（字节）")
    duration = Column(Integer, nullable=True, comment="时长（秒，用于视频/音频）")

    # 关联信息
    knowledge_points = Column(JSONB, nullable=True, comment="关联的知识点")
    tags = Column(JSONB, nullable=True, comment="标签")
    description = Column(Text, nullable=True, comment="资源描述")

    # 生成信息
    generation_params = Column(JSONB, nullable=True, comment="生成参数")
    task_id = Column(String(100), nullable=True, comment="异步任务ID")

    # 统计信息
    view_count = Column(Integer, default=0, comment="查看次数")
    download_count = Column(Integer, default=0, comment="下载次数")

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True, comment="完成时间")

    # 关系
    user = relationship("User", back_populates="resources")

    def __repr__(self):
        return f"<Resource(id={self.id}, name={self.name}, type={self.resource_type})>"


# ==================== 学习进度 ====================

class LearningProgress(Base):
    """学习进度表"""
    __tablename__ = "learning_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 学习内容标识
    content_type = Column(String(50), nullable=False, comment="内容类型（course/chapter/lesson）")
    content_id = Column(String(100), nullable=False, comment="内容ID")
    content_name = Column(String(200), nullable=True, comment="内容名称")

    # 进度信息
    progress_percentage = Column(Float, default=0.0, comment="完成百分比")
    is_completed = Column(Boolean, default=False, comment="是否完成")

    # 学习数据
    time_spent = Column(Integer, default=0, comment="学习时长（秒）")
    attempt_count = Column(Integer, default=0, comment="尝试次数")
    score = Column(Float, nullable=True, comment="得分")

    # 元数据
    progress_metadata = Column(JSONB, nullable=True, comment="其他学习数据")

    # 时间戳
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    last_accessed_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # 关系
    user = relationship("User", back_populates="learning_progress")

    def __repr__(self):
        return f"<LearningProgress(user_id={self.user_id}, content={self.content_type}:{self.content_id})>"


# ==================== 异步任务 ====================

class TaskStatus(enum.Enum):
    """任务状态枚举"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AsyncTask(Base):
    """异步任务表（用于跟踪长时间运行的任务）"""
    __tablename__ = "async_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 任务信息
    task_id = Column(String(100), unique=True, index=True, nullable=False, comment="任务唯一标识")
    task_type = Column(String(50), nullable=False, comment="任务类型")
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.PENDING, comment="任务状态")

    # 任务参数和结果
    params = Column(JSONB, nullable=True, comment="任务参数")
    result = Column(JSONB, nullable=True, comment="任务结果")
    error_message = Column(Text, nullable=True, comment="错误信息")

    # 进度信息
    progress = Column(Float, default=0.0, comment="任务进度（0-100）")

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<AsyncTask(id={self.id}, task_id={self.task_id}, status={self.status})>"


# ==================== 学习效果评估 ====================

class LearningEvent(Base):
    """学习事件日志表 - 记录用户所有学习行为"""
    __tablename__ = "learning_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 事件信息
    event_type = Column(String(50), nullable=False, comment="事件类型: quiz_complete/flashcard_review/chat_message/page_visit/graph_explore")
    event_data = Column(JSONB, nullable=False, comment="事件数据: {score, topic, duration, is_correct, ...}")
    session_id = Column(String(100), nullable=True, comment="关联的会话ID")

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_learning_events_user_created", "user_id", "created_at"),
        Index("ix_learning_events_user_type", "user_id", "event_type"),
    )

    def __repr__(self):
        return f"<LearningEvent(id={self.id}, type={self.event_type}, user_id={self.user_id})>"


class EvaluationReport(Base):
    """AI 分析报告缓存表"""
    __tablename__ = "evaluation_reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 报告信息
    report_date = Column(Date, nullable=False, comment="报告日期")
    period_days = Column(Integer, default=7, comment="评估窗口天数")

    # 核心数据
    radar_scores = Column(JSONB, nullable=True, comment="雷达图分数: {memory, logic, application, innovation, breadth}")
    trend_scores = Column(JSONB, nullable=True, comment="趋势数据: [{date, score}, ...]")
    summary_score = Column(Float, nullable=True, comment="综合评分")
    effective_seconds = Column(Integer, nullable=True, comment="有效学习时长(秒)")
    mastered_points = Column(Integer, nullable=True, comment="掌握知识点数")

    # AI 生成内容
    insight_text = Column(Text, nullable=True, comment="AI 生成的洞察文本")
    highlight_tags = Column(JSONB, nullable=True, comment="高亮标签: ['逻辑推演', '综合应用']")
    action_item = Column(Text, nullable=True, comment="行动建议")

    # 调试用
    raw_input = Column(JSONB, nullable=True, comment="发送给 Agent 的原始数据")

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_evaluation_reports_user_date", "user_id", "report_date", unique=True),
    )

    def __repr__(self):
        return f"<EvaluationReport(id={self.id}, user_id={self.user_id}, date={self.report_date})>"
