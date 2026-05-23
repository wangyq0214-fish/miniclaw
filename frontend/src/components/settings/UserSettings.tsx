'use client';

import { useEffect, useState } from 'react';
import { X, User, BookOpen, Target, Save, Loader2, Sparkles } from 'lucide-react';
import PetSettings from '@/components/pet/PetSettings';
import AvatarUpload from '@/components/profile/AvatarUpload';
import { useAvatar } from '@/hooks/useAvatar';
import { getUserProfile, updateUserProfile, type UserProfile } from '@/lib/api';
import { toast } from 'sonner';

interface UserSettingsProps {
  onClose: () => void;
}

export function UserSettings({ onClose }: UserSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'plan' | 'profile' | 'pet'>('basic');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await getUserProfile();
      setProfile(data);
    } catch (error) {
      toast.error('加载用户信息失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      await updateUserProfile(profile);
      toast.success('保存成功');
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-background rounded-none md:rounded-lg shadow-xl w-full max-w-4xl h-screen md:h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b">
          <h2 className="text-lg md:text-xl font-semibold">用户设置</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b">
          <button
            onClick={() => setActiveTab('basic')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === 'basic'
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-4 h-4 inline mr-2" />
            基本信息
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === 'profile'
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Target className="w-4 h-4 inline mr-2" />
            用户画像
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === 'plan'
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen className="w-4 h-4 inline mr-2" />
            学习计划
          </button>
          <button
            onClick={() => setActiveTab('pet')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === 'pet'
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-4 h-4 inline mr-2" />
            桌面宠物
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'basic' && (
            <BasicInfoTab profile={profile} onChange={setProfile} />
          )}
          {activeTab === 'profile' && (
            <ProfileTab profile={profile} onChange={setProfile} />
          )}
          {activeTab === 'plan' && (
            <PlanTab profile={profile} />
          )}
          {activeTab === 'pet' && (
            <PetSettings />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function BasicInfoTab({ profile, onChange }: { profile: UserProfile; onChange: (p: UserProfile) => void }) {
  const { avatar, uploadAvatar, deleteAvatar } = useAvatar();

  return (
    <div className="space-y-6">
      {/* Avatar Section */}
      <div className="flex justify-center py-4">
        <AvatarUpload
          currentAvatar={avatar}
          onUpload={uploadAvatar}
          onDelete={deleteAvatar}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">用户名</label>
        <input
          type="text"
          value={profile.username || ''}
          onChange={(e) => onChange({ ...profile, username: e.target.value })}
          className="w-full px-3 py-2 border rounded-md bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">邮箱</label>
        <input
          type="email"
          value={profile.email || ''}
          disabled
          className="w-full px-3 py-2 border rounded-md bg-muted text-muted-foreground"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">姓名/昵称</label>
        <input
          type="text"
          value={profile.basic_info?.name || ''}
          onChange={(e) => onChange({
            ...profile,
            basic_info: { ...profile.basic_info, name: e.target.value }
          })}
          className="w-full px-3 py-2 border rounded-md bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">专业</label>
        <input
          type="text"
          value={profile.basic_info?.major || ''}
          onChange={(e) => onChange({
            ...profile,
            basic_info: { ...profile.basic_info, major: e.target.value }
          })}
          className="w-full px-3 py-2 border rounded-md bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">年级/学段</label>
        <input
          type="text"
          value={profile.basic_info?.grade || ''}
          onChange={(e) => onChange({
            ...profile,
            basic_info: { ...profile.basic_info, grade: e.target.value }
          })}
          className="w-full px-3 py-2 border rounded-md bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">学校</label>
        <input
          type="text"
          value={profile.basic_info?.school || ''}
          onChange={(e) => onChange({
            ...profile,
            basic_info: { ...profile.basic_info, school: e.target.value }
          })}
          className="w-full px-3 py-2 border rounded-md bg-background"
        />
      </div>
    </div>
  );
}

function ProfileTab({ profile, onChange }: { profile: UserProfile; onChange: (p: UserProfile) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">学习目标</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">短期目标 (1-4周)</label>
            <textarea
              value={profile.learning_goals?.short_term || ''}
              onChange={(e) => onChange({
                ...profile,
                learning_goals: { ...profile.learning_goals, short_term: e.target.value }
              })}
              rows={3}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">长期目标 (学期级)</label>
            <textarea
              value={profile.learning_goals?.long_term || ''}
              onChange={(e) => onChange({
                ...profile,
                learning_goals: { ...profile.learning_goals, long_term: e.target.value }
              })}
              rows={3}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">认知风格</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">学习偏好</label>
            <textarea
              value={profile.cognitive_style?.preference || ''}
              onChange={(e) => onChange({
                ...profile,
                cognitive_style: { ...profile.cognitive_style, preference: e.target.value }
              })}
              rows={3}
              placeholder="例如：示例驱动、视觉化学习、深度学习等"
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanTab({ profile }: { profile: UserProfile }) {
  return (
    <div className="space-y-6">
      <div className="bg-muted/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">当前学习计划</h3>
        {profile.learning_plan ? (
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-sm">{profile.learning_plan}</pre>
          </div>
        ) : (
          <p className="text-muted-foreground">暂无学习计划</p>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        <p>学习计划由系统根据您的学习情况自动生成和更新。</p>
      </div>
    </div>
  );
}
