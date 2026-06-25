# meme-opossum

一个零依赖的表情包生成器:静态页 + 服务端无头浏览器截图,把文字叠加到底图上,直接返回 PNG。

主要给 iOS 捷径 / 第三方客户端用 —— 一次 GET 拿到现成图片字节,适合直接分享到聊天 App。

> **本仓库是自部署项目,不提供公共实例**。需要按 [自部署](#自部署) 步骤跑到自己的服务器上,后文所有 `<your-server>` 占位都指你自己那台机器(IP 或域名)。

---

## 端点

部署完成后,以下端点开放在你的服务器上:

| 用途 | 端点 |
|---|---|
| 网页版(浏览器画图 + 自动下载) | `GET /?text=&img=` |
| 渲染 API(直返 PNG 字节) | `GET /api?text=&img=` |
| 底图清单(JSON,扫盘动态生成) | `GET /api/manifest` |
| 单张底图(原图) | `GET /images/<path>.<ext>` |

---

## API

```
GET /api?text=<文案>&img=<相对路径>
```

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | string | 否 | 表情包文字,用 `,` 或 `，` 分隔最多 3 行 |
| `img` | string | **是** | `images/` 下的相对路径,**不带扩展名**,UTF-8,需 URL 编码 |

`img` 支持两种形态:
- 顶层独立项:`猫咪上班忙碌到尖叫`
- 一级分组下:`负鼠系列/背手`

服务端只接受最多两级、无 `..`、无绝对路径、必须命中真实文件,否则 400。

**返回**:`Content-Type: image/png`,直接是 PNG 字节流。

示例:

```
http://<your-server>/api?text=今天也要,加油呀&img=%E8%B4%9F%E9%BC%A0%E7%B3%BB%E5%88%97%2F%E8%83%8C%E6%89%8B
```

文字渲染规则:

- 字号、行高、描边粗细按底图高度等比缩放,任意尺寸的底图都能用
- **自适应配色**:逐行采样背景亮度,亮区用黑字白边、暗区用白字黑边
- **emoji 走 Noto Color Emoji 渲染、不描边**,保持原生彩色字形
- 沉底居中,超过 3 段会被截断

---

## 底图清单 `/api/manifest`

服务端实时扫 `images/` 目录生成,**最多两级嵌套**:

```json
{
  "猫咪上班忙碌到尖叫": "猫咪上班忙碌到尖叫",
  "负鼠系列": {
    "背手": "负鼠系列/背手",
    "跳楼": "负鼠系列/跳楼"
  },
  "熊猫头系列": {
    "比耶": "熊猫头系列/比耶",
    "生气": "熊猫头系列/生气"
  }
}
```

- 叶子值是 **字符串** → 直接作为 `img` 参数透传
- 叶子值是 **对象** → 是分组,需要再选一层
- 键按 `zh-Hans-CN` 排序,顺序稳定
- 响应 `Cache-Control: no-cache`,加图后下一次请求立即生效

---

## 添加新底图

零配置,**不需要改任何 JSON**:

1. 把图丢进 `images/<分类>/<显示名>.<ext>`,例如 `images/熊猫头系列/狗头.webp`
   - 顶层 `.ext` = 独立项;一级目录 = 分组;**不支持更深嵌套**
   - 文件名(去扩展名)就是 manifest 里的显示 key,UTF-8 中文随便用
   - 支持扩展名:`jpg / jpeg / png / webp / gif`,自动按顺序探测
2. 推送 + 重启服务器 —— `/api/manifest` 下一次响应就包含新图

---

## iOS 捷径伪代码

```text
1. 获取 URL 内容   GET   http://<your-server>/api/manifest
2. 从输入获取词典   → cur
3. 循环最多 2 次:
     a. 从词典获取键 cur            → keys
     b. 从列表中选择 keys           → choice
     c. 从词典获取值 cur[choice]    → value
     d. 如果 类型(value) == 词典:
            cur = value           (进入分组,继续循环)
        否则:
            imgPath = value       (拿到字符串路径,跳出循环)
4. URL 编码 imgPath                 → encodedImg
5. 要求输入文本: "请输入文案"        → text
6. URL 编码 text                    → encodedText
7. 文本:
     http://<your-server>/api?img=[encodedImg]&text=[encodedText]
8. 获取 URL 内容   GET   上一步文本   → PNG 字节
9. 共享 / 存储到照片
```

**为什么从服务器拿 manifest 而不是写死在捷径里**

- 把捷径分享给朋友,他们看到的选项永远是 manifest 当前内容 —— 你加图、改名,他们下次跑就更新
- 朋友手敲一个不存在的路径会被服务端 400 拦截,**不构成有效的"自带图"通道**

---

## 仓库结构

```
meme-opossum/
├── index.html              网页版(浏览器 canvas 渲染 + 自动下载)
├── images/                 底图资源,文件名即显示名
│   ├── 猫咪上班忙碌到尖叫.jpg
│   ├── 负鼠系列/
│   │   ├── 背手.jpg
│   │   └── 跳楼.jpg ...
│   └── 熊猫头系列/
│       ├── 比耶.webp ...
├── fonts/                  自托管字体
│   ├── NotoColorEmoji.ttf  emoji 字体(~10MB)
│   └── OFL.txt             SIL Open Font License 1.1
├── server/                 服务端渲染服务
│   ├── index.js            Express + puppeteer,127.0.0.1:8787
│   └── package.json
├── deploy/                 部署产物
│   ├── meme-render.service systemd 单元
│   └── nginx-meme.conf     nginx 站点配置(/api 反代到 8787)
├── start.sh                git pull + npm install + 同步配置 + 重启
├── stop.sh                 stop systemd service
├── restart.sh              stop.sh && start.sh
└── README.md
```

---

## 自部署

任何 Linux 服务器都能跑(下面以 Ubuntu 24.04 为例)。

```bash
# 1) 装依赖(git/nginx/node/npm + chromium 运行时库 + 中文字体)
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  git nginx ca-certificates curl nodejs npm \
  fonts-liberation fonts-noto-cjk \
  libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libcairo2 libcups2t64 \
  libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0t64 libgtk-3-0t64 \
  libnspr4 libnss3 libpango-1.0-0 libwayland-client0 libx11-6 libx11-xcb1 \
  libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
  libxrandr2 xdg-utils

# 2) clone 到 /opt
sudo git clone https://github.com/ALANGMeow/meme-opossum.git /opt/meme-opossum

# 3) 一键拉起(装 server 依赖、写 systemd、写 nginx、重启)
cd /opt/meme-opossum && sudo bash start.sh
```

成功后 `http://<your-server>/api/manifest` 返回底图清单,`http://<your-server>/api?img=负鼠系列/背手&text=hi`(实际请求需 URL 编码)返回 PNG。

> nginx 配置默认监听 80,`server_name _`(裸 IP 也接)。要绑域名 + HTTPS 改 `deploy/nginx-meme.conf` 加 `server_name` 和 certbot。

---

## 更新流程(已部署的服务器)

服务器上执行:

```bash
cd /opt/meme-opossum && bash restart.sh
```

`restart.sh` 会:`git pull` → `npm install` → 同步 systemd unit / nginx 配置 → 重启服务 → reload nginx。

仓库根的 Windows 一键脚本 `meme.ps1`(放在 PATH 上)能在本地一行完成 commit + push + 远端重启:

```powershell
meme "add image: 熊猫头系列/狗头"
```

---

## 字体致谢

本仓库自托管 [Noto Color Emoji](https://github.com/googlefonts/noto-emoji)(© Google,SIL Open Font License 1.1)用于服务端 + 浏览器版渲染 emoji。许可证副本见 `fonts/OFL.txt`。

iOS 捷径只下 PNG,不下字体;浏览器版首次访问会下一次 ~10MB ttf,nginx 缓存 30 天后续命中本地。

## 致谢

底图素材均为常见网络表情包,版权归原作者所有,本仓库仅用于个人聊天互动,**不用于商业用途**。
