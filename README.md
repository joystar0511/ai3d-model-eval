# AI 3D 拓扑低模评测工具

基于 Three.js 的 AI 3D 拓扑低模评测 Web Demo，支持多格式模型上传、4 种预览模式、AI 自动评分、模型 PK 对比和云端模型库。

## 功能特性

- **多格式模型上传**：支持 OBJ、FBX、GLTF/GLB、STL、PLY
- **4 种预览模式**：灰模、线框、颜色贴图、材质灯光（平行光 + 法线/金属度/粗糙度贴图）
- **AI 自动评分**：11 维度评测，满分 100 分，含进度条和评分明细
- **模型 PK 对比**：多模型对比评测，可视化数据统计与分析
- **云端模型库**：分享模型到云端，所有人可浏览
- **评分标准页**：独立页面展示评分细则

## 本地运行

```bash
# 进入项目目录
cd ai3d-eval

# 方式1: Python 启动本地服务器
python -m http.server 8080

# 方式2: Node.js 启动
npx serve .

# 方式3: VS Code Live Server 插件
# 右键 index.html → Open with Live Server
```

浏览器访问 http://localhost:8080

## 部署到 GitHub Pages（详细教程）

### 第一步：创建 GitHub 仓库

1. 登录 [GitHub](https://github.com)
2. 点击右上角 **+** → **New repository**
3. 仓库名填 `ai3d-model-eval`（或任意名称）
4. 选择 **Public**（公开）
5. 勾选 **Add a README file**
6. 点击 **Create repository**

### 第二步：上传项目文件

**方法 A：网页上传（最简单）**

1. 在仓库页面点击 **Add file** → **Upload files**
2. 将 `ai3d-eval` 文件夹内所有文件拖入（index.html、scoring.html、library.html、css/、js/）
3. 填写 commit message：`Initial commit - AI 3D Model Evaluation Tool`
4. 点击 **Commit changes**

**方法 B：Git 命令行上传**

```bash
# 克隆仓库
git clone https://github.com/你的用户名/ai3d-model-eval.git

# 将项目文件复制到仓库目录
# 确保 index.html 在仓库根目录

# 进入仓库目录
cd ai3d-model-eval

# 添加文件
git add .

# 提交
git commit -m "Initial commit - AI 3D Model Evaluation Tool"

# 推送
git push origin main
```

### 第三步：开启 GitHub Pages

1. 在仓库页面点击 **Settings**（设置）
2. 左侧菜单找到 **Pages**
3. **Source** 选择 **Deploy from a branch**
4. **Branch** 选择 `main`，文件夹选 `/ (root)`
5. 点击 **Save**

等待 1-2 分钟后，页面顶部会显示你的网站地址：

```
https://你的用户名.github.io/ai3d-model-eval/
```

### 第四步：验证

打开上述链接，即可看到你的 AI 3D 拓扑低模评测工具！

## 部署到 Vercel（备选）

1. 注册 [Vercel](https://vercel.com)
2. 点击 **New Project**
3. 导入你的 GitHub 仓库
4. Framework Preset 选 **Other**
5. 点击 **Deploy**
6. 几秒后即可获得 `https://ai3d-model-eval.vercel.app` 地址

## 部署到 Netlify（备选）

1. 注册 [Netlify](https://netlify.com)
2. 点击 **Add new site** → **Deploy manually**
3. 将整个 `ai3d-eval` 文件夹拖入拖拽区域
4. 即可获得 `https://xxx.netlify.app` 地址

## 项目结构

```
ai3d-eval/
├── index.html          # 主页面（评测工具）
├── scoring.html        # 评分标准页面
├── library.html        # 云端模型库页面
├── css/
│   └── style.css       # 全局样式
├── js/
│   ├── viewer.js       # Three.js 3D 模型预览器
│   ├── evaluator.js    # AI 评测引擎
│   ├── cloud.js        # 云端存储模块
│   └── app.js          # 主应用逻辑
└── README.md           # 说明文档
```

## 技术栈

- **Three.js r160** - 3D 渲染引擎
- **ES Modules + ImportMap** - 模块化加载
- **Vanilla JS** - 无框架依赖
- **CSS3** - 响应式暗色主题

## 评分维度（11 项，满分 100）

| 维度 | 分值 |
|------|------|
| 隐藏面 | 10 |
| 破面 | 10 |
| 重合点 | 10 |
| 布线均匀度 | 10 |
| 可绑定程度 | 10 |
| UV 利用度 | 20 |
| 贴图细节与复杂性 | 10 |
| 贴图色彩 | 10 |
| 一致性与伪影 | 10 |
| 材质合理性 | 10 |
| 法线贴图质量 | 10 |

原始总分 120 分，归一化为 100 分制。

## 云端分享说明

当前版本使用 `localStorage` 模拟云端存储（单浏览器内可见）。如需实现真正的跨用户分享，请在 `js/cloud.js` 中配置后端 API：

```javascript
// 在 index.html 的 <script> 标签前添加：
window.CLOUD_API_URL = 'https://your-api.com/models';
```

推荐的后端方案：
- **Firebase Realtime Database**（免费额度充足）
- **Supabase**（开源 Firebase 替代）
- **Vercel Serverless Functions** + 数据库

## 浏览器兼容性

- Chrome / Edge 90+
- Firefox 88+
- Safari 14+
- 需要 WebGL 2.0 支持

## License

MIT
