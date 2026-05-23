'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { tokenManager } from '@/lib/auth';
import {
  Brain,
  MessageSquare,
  GitBranch,
  BookOpen,
  Sparkles,
  ArrowRight,
  ArrowUp,
  GraduationCap,
  Zap,
  Shield,
} from 'lucide-react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const features = [
  {
    icon: MessageSquare,
    title: 'AI 智能对话',
    description: '基于大语言模型的智能问答，支持多轮对话、代码高亮、Markdown 渲染，让学习更高效。',
  },
  {
    icon: GitBranch,
    title: '知识图谱',
    description: '可视化知识关联网络，智能追踪学习路径，帮助你构建完整的知识体系。',
  },
  {
    icon: Brain,
    title: '个性化学习',
    description: '智能分析学习风格与知识水平，自适应推荐学习内容，打造专属学习体验。',
  },
  {
    icon: BookOpen,
    title: '丰富的学习工具',
    description: '闪卡记忆、错题本、思维导图、代码运行器等多种学习工具，一站式解决学习需求。',
  },
];

const stats = [
  { value: 'AI', label: '驱动引擎' },
  { value: 'RAG', label: '知识检索' },
  { value: '多模态', label: '内容呈现' },
  { value: '实时', label: '流式响应' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

export default function LandingPage() {
  const router = useRouter();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Color helpers for dark/light mode
  const c = (light: string, dark: string) => isDark ? dark : light;

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStart = () => {
    const token = tokenManager.getToken();
    if (token) {
      router.push('/app');
    } else {
      router.push('/login');
    }
  };

  return (
    <div
      className="min-h-screen text-foreground overflow-x-hidden"
      style={{
        background: c(
          `linear-gradient(135deg,
            #f0e6ff 0%,
            #e8f0ff 20%,
            #f5f5ff 40%,
            #e6f5f5 60%,
            #f0eaff 80%,
            #f5f0ff 100%)`,
          `linear-gradient(135deg,
            #1a1030 0%,
            #101828 20%,
            #0f1420 40%,
            #101525 60%,
            #15102a 80%,
            #1a1030 100%)`
        ),
      }}
    >
      {/* Additional glow effects */}
      <div className="fixed inset-0 -z-20 overflow-hidden pointer-events-none">
        {/* Top center glow - purple */}
        <div
          className="absolute -top-[30%] left-1/2 -translate-x-1/2 w-[140%] h-[70%]"
          style={{
            background: c(
              `radial-gradient(ellipse 50% 50% at 50% 30%, rgba(167, 139, 250, 0.3), transparent)`,
              `radial-gradient(ellipse 50% 50% at 50% 30%, rgba(139, 92, 246, 0.15), transparent)`
            ),
          }}
        />
        {/* Top left glow - blue */}
        <div
          className="absolute -top-[15%] -left-[15%] w-[60%] h-[60%] rounded-full blur-3xl"
          style={{ background: c('rgba(96, 165, 250, 0.2)', 'rgba(59, 130, 246, 0.1)') }}
        />
        {/* Top right glow - cyan */}
        <div
          className="absolute top-[5%] -right-[10%] w-[50%] h-[50%] rounded-full blur-3xl"
          style={{ background: c('rgba(34, 211, 238, 0.15)', 'rgba(6, 182, 212, 0.08)') }}
        />
        {/* Middle left glow - pink */}
        <div
          className="absolute top-[25%] -left-[10%] w-[45%] h-[45%] rounded-full blur-3xl"
          style={{ background: c('rgba(244, 114, 182, 0.12)', 'rgba(236, 72, 153, 0.06)') }}
        />
        {/* Bottom right glow - purple */}
        <div
          className="absolute -bottom-[15%] -right-[15%] w-[60%] h-[60%] rounded-full blur-3xl"
          style={{ background: c('rgba(168, 85, 247, 0.15)', 'rgba(147, 51, 234, 0.08)') }}
        />
        {/* Bottom left glow - teal */}
        <div
          className="absolute -bottom-[10%] left-[10%] w-[40%] h-[40%] rounded-full blur-3xl"
          style={{ background: c('rgba(45, 212, 191, 0.1)', 'rgba(20, 184, 166, 0.06)') }}
        />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0"
          style={{
            opacity: c('0.04', '0.06'),
            backgroundImage: `linear-gradient(rgba(139, 92, 246, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(139, 92, 246, 0.3) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Scroll progress bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[3px] z-[60] origin-left"
        style={{
          scaleX,
          background: 'linear-gradient(90deg, hsl(264 80% 60%), hsl(264 60% 70%))',
        }}
      />

      {/* Back to top button */}
      <motion.button
        onClick={scrollToTop}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: showBackToTop ? 1 : 0,
          scale: showBackToTop ? 1 : 0.8,
          y: showBackToTop ? 0 : 20,
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed bottom-8 right-8 z-50 w-11 h-11 rounded-full bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 flex items-center justify-center hover:bg-primary transition-colors backdrop-blur-sm"
        style={{ pointerEvents: showBackToTop ? 'auto' : 'none' }}
      >
        <ArrowUp className="w-5 h-5" />
      </motion.button>

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-foreground rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-background rounded-sm" />
            </div>
            <span className="font-bold text-lg">Mini OpenClaw</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={() => router.push('/login')}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              登录
            </button>
            <button
              onClick={handleStart}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              开始使用
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Hero background effects */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[1100px] h-[900px] rounded-full blur-3xl"
            style={{
              background: c(
                'linear-gradient(to bottom, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.1), transparent)',
                'linear-gradient(to bottom, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.05), transparent)'
              ),
            }}
          />
          <div
            className="absolute -top-[10%] right-[5%] w-[500px] h-[500px] rounded-full blur-3xl"
            style={{ background: c('rgba(6, 182, 212, 0.15)', 'rgba(6, 182, 212, 0.08)') }}
          />
          <div
            className="absolute top-[10%] left-[5%] w-[400px] h-[400px] rounded-full blur-3xl"
            style={{ background: c('rgba(244, 114, 182, 0.12)', 'rgba(244, 114, 182, 0.06)') }}
          />
        </div>

        <motion.div
          className="max-w-4xl mx-auto text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-muted/50 text-sm text-muted-foreground mb-8"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span>AI 驱动的智能学习平台</span>
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-tight mb-6"
            style={{
              fontFamily: '"Zhi Mang Xing", cursive',
              letterSpacing: '0.05em',
              fontWeight: 400,
            }}
          >
            让学习
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              更智能
            </span>
            ，<br className="hidden sm:block" />
            让知识
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              更有体系
            </span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Mini OpenClaw 是一个基于大语言模型的智能学习助手平台，集成了 AI 对话、知识图谱、个性化学习等功能，帮助你高效构建知识体系。
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleStart}
              className="group flex items-center gap-2 px-8 py-3.5 text-base font-medium bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all shadow-lg shadow-primary/20"
            >
              立即体验
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => router.push('/login')}
              className="px-8 py-3.5 text-base font-medium text-foreground border border-border rounded-xl hover:bg-muted/50 transition-colors"
            >
              登录账户
            </button>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-border relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: c(
              'linear-gradient(90deg, #f0e6ff, #e8f4ff, #e6f5f0)',
              'linear-gradient(90deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.06), rgba(20, 184, 166, 0.05))'
            ),
          }}
        />
        <motion.div
          className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 px-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
        >
          {stats.map((stat) => (
            <motion.div key={stat.label} variants={itemVariants} className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <motion.div
          className="max-w-6xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div variants={itemVariants} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">核心功能</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              集合多种 AI 能力与学习工具，为你打造全方位的智能学习体验
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature) => (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                className="group relative p-6 rounded-2xl border border-border bg-card hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Highlights */}
      <section className="py-20 px-6 relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: c(
              'linear-gradient(135deg, #e8f4ff, #f0e6ff, #f5e6ff)',
              'linear-gradient(135deg, rgba(59, 130, 246, 0.06), rgba(139, 92, 246, 0.06), rgba(168, 85, 247, 0.06))'
            ),
          }}
        />
        <motion.div
          className="max-w-5xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div variants={itemVariants} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">为什么选择 Mini OpenClaw</h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: GraduationCap,
                title: '科学学习方法',
                desc: '基于认知科学的学习路径规划，结合遗忘曲线和知识图谱，让学习更高效。',
              },
              {
                icon: Zap,
                title: '极速响应',
                desc: '流式输出、实时反馈，AI 对话零等待。支持代码在线运行，即学即练。',
              },
              {
                icon: Shield,
                title: '安全可靠',
                desc: '数据加密存储，隐私安全有保障。支持多种 LLM 后端，灵活部署。',
              },
            ].map((item) => (
              <motion.div key={item.title} variants={itemVariants} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 relative">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: c(
              'linear-gradient(to bottom, transparent, rgba(255,255,255,0.4), rgba(255,255,255,0.3), transparent)',
              'linear-gradient(to bottom, transparent, rgba(255,255,255,0.06), rgba(255,255,255,0.04), transparent)'
            ),
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] rounded-full blur-3xl pointer-events-none"
          style={{ background: c('rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.12)') }}
        />
        <motion.div
          className="max-w-3xl mx-auto text-center relative z-10"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.h2 variants={itemVariants} className="text-3xl md:text-4xl font-bold mb-4">
            准备好开始了吗？
          </motion.h2>
          <motion.p variants={itemVariants} className="text-muted-foreground text-lg mb-8">
            立即体验 AI 驱动的智能学习之旅
          </motion.p>
          <motion.button
            variants={itemVariants}
            onClick={handleStart}
            className="group inline-flex items-center gap-2 px-10 py-4 text-lg font-medium bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 relative z-10"
          >
            立即体验
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-foreground rounded-md flex items-center justify-center">
              <div className="w-2 h-2 bg-background rounded-[1px]" />
            </div>
            <span>Mini OpenClaw</span>
          </div>
          <div>AI 驱动的智能学习平台</div>
        </div>
      </footer>
    </div>
  );
}
