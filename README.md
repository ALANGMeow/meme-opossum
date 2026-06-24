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
| 底图清单(JSON,带分组) | `GET /images/manifest.json` |
| 单张底图(原图) | `GET /images/<n>.<ext>` |

---

## API

```
GET /api?text=<文案>&img=<编号>
```

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `text` | string | 空 | 表情包文字。用 `,` 或 `，` 分隔最多 3 行 |
| `img` | int | `0` | 底图编号,从 0 开始 |

**返回**:`Content-Type: image/png`,直接是 PNG 字节流。

示例:

```
http://<your-server>/api?text=今天也要,加油呀&img=0
```

文字渲染规则:

- 字号、行高、阴影按底图高度等比缩放,任意尺寸的底图都能用
- 文字白色 + 深色阴影,沉底居中
- 超过 3 段会被截断

---

## 底图清单 `manifest.json`

`/images/manifest.json` 是底图编号的人类可读索引,**支持一级分组**:

```json
{
  "负鼠系列": {
    "背手": 0,
    "跳楼": 1,
    "真棒": 3
  },
  "猫咪上班忙碌到尖叫": 2
}
```

- 叶子值是 **整数** → 直接是 `img` 参数
- 叶子值是 **对象** → 是分组,需要再选一层
- 该 JSON 的 `Cache-Control: no-cache`,改完立即生效,客户端不会拿到旧版

---

## 添加新底图

1. 把图丢进 `images/` 目录,文件名是**下一个空闲编号** + 扩展名,例如 `images/9.png`
   - 支持的扩展名:`jpg` / `jpeg` / `png` / `webp` / `gif`,自动按顺序探测,不用改代码
   - 任意尺寸,canvas 会自适应
2. 在 `images/manifest.json` 加一条:`"中文描述": 9`(或塞进某个分组里)
3. 推送 + 重启服务器(本仓库提供了一键脚本,见下)

---

## iOS 捷径伪代码

支持嵌套 manifest(分组减少列表长度)。注意捷径里用"**类型**"判断比字符串前缀稳。

```text
1. 获取 URL 内容   GET   http://<your-server>/images/manifest.json
2. 从输入获取词典(把上一步 JSON 转成词典 cur)
3. 循环最多 N 次(N=manifest 嵌套深度,通常 2):
     a. 从词典获取键 cur            → keys
     b. 从列表中选择 keys           → choice
     c. 从词典获取值 cur[choice]    → value
     d. 如果 类型(value) == 词典:
            cur = value           (进入分组,继续循环)
        否则:
            imgId = value         (拿到叶子编号,跳出循环)
4. 要求输入文本: "请输入文案"        → text
5. URL 编码 text                    → encodedText
6. 文本:
     http://<your-server>/api?img=[imgId]&text=[encodedText]
7. 获取 URL 内容   GET   上一步文本   → PNG 字节
8. 共享 / 存储到照片
```

**为什么从服务器拿 manifest 而不是写死在捷径里**

- 把捷径分享给朋友,他们看到的选项永远是 manifest 当前内容 —— 你加图、改名,他们下次跑就更新
- 朋友手敲一个不存在的编号(比如直接改捷径 `?img=99`)会因为底图找不到而 500,**不构成有效的"自带图"通道**

---

## 仓库结构

```
meme-opossum/
├── index.html              网页版(浏览器 canvas 渲染 + 自动下载)
├── images/                 底图资源
│   ├── 0.jpg
│   ├── 1.jpg ...
│   └── manifest.json       编号 ↔ 描述索引(支持分组)
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

成功后 `http://<your-server>/` 出现网页版,`http://<your-server>/api?text=hi` 返回 PNG。

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
meme "add image 9: 哭哭"
```

---

## 致谢

底图素材均为常见网络表情包,版权归原作者所有,本仓库仅用于个人聊天互动,**不用于商业用途**。
