# Onedrive Docker Index

中文 | [English](./README_en.md)

## 🤔 这是什么？
本项目是基于[ondrive-vercel-index](https://github.com/spencerwooo/onedrive-vercel-index)的二次开发项目。由于原项目已经处于`Archive`状态，因此，本项目的主要目的是修复原项目中存在的较为严重的安全漏洞（详见[安全问题修复](#❗安全问题修复))、并对界面与性能进行优化，与此同时，也提供了`Docker`环境的部署方案。本项目继承了原项目所有的功能特性，您可以参照[原项目的帮助文档](https://ovi.swo.moe/zh/docs/getting-started)来进行自定义操作。

很惭愧，作为一个**超业余前后端开发者**，我的编程水平远不及参与原项目开发的各位大佬，因此无法对二开后的项目质量做出保证；同时，因为本项目的创建初衷是为了搭建我自己的个人站点，因此，其中存在许多定制化的内容，若有需要，您可以自行调整。您可以在后文的[定制您的站点](#🏞-定制您的站点)部分找到帮助。

## ❓ 它与`onedrive-vercel-index`有何不同？

- 修复了若干严重的[安全问题](#❗安全问题修复)
- 提供了Docker部署方案
- 提高Redis缓存利用率，提升网站性能
- 界面显示优化（支持自定义背景图片等）
- 提升用户安全性
- ...

## 🎉 快速上手

虽说快速上手，但本项目的实际操作流程，相较于原项目，确实繁琐不少。

### Step 1
`Clone`这个项目到您的服务器，并获取您自己的`ClientID`与`ClientSecret`。

获取方法参考[原项目教程](https://ovi.swo.moe/zh/docs/advanced)。

**不过，与原教程不同的是，获取的`ClientSecret`无需加密！请在Step 2中直接填写未经加密的`ClientID`与`ClientSecret`！**


### Step 2
在项目根目录创建`.env`文件，文件需要填写的内容如下：
```env
NODE_ENV=production  # 部署环境，默认为production模式，无需更改
NEXT_PUBLIC_USER_PRINCIPLE_NAME=Your Onedrive Username  # 您的Onedrive账号，作绑定用
KV_PREFIX=GALBOX  # Redis存储的前缀，可根据自己情况修改
REDIS_URL=redis://redis:6379  # 正常情况下无需修改，若您需要使用外部的Redis服务，则需要填写
MS_CLIENT_ID=Your Client ID  # 您的ClientID
MS_CLIENT_SECRET=Your Client Secret  # 您的ClientSecret
SECRET_KEY=Your Secret Key  # AES加密用的Secret Key，它是绝对保密的
```
**注意`ClientSecret`是未经加密的！**

### Step 3

根据不同的系统，选择相应的指令，运行指令构建并启动镜像。

**Linux系统：**
```shell
chmod +x ./build.sh
./build.sh
```

**Windows系统：**
```shell
./build.bat
```

### Step 4
项目已经构建完成，端口为`20011`，不过我们更推荐您使用Nginx反向代理的方式提供服务。下面是一个反向代理的示例配置：
```conf
#PROXY-START/

location ^~ /
{
    proxy_pass http://127.0.0.1:20011;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_http_version 1.1;
    proxy_cache_bypass 'Od-Protected-Token';
}

#PROXY-END/
```

### Step 5
接下来的步骤与原教程完全一致，[点击查看](https://ovi.swo.moe/zh/docs/getting-started#%E8%BF%9B%E8%A1%8C%E8%AE%A4%E8%AF%81)。


🎉大功告成！


## ❗安全问题修复

> **请勿利用下文的任何漏洞对任何服务器发起攻击！**

本项目针对`onedrive-vercel-index`中存在的部分较为严重的安全问题进行了修复，为了保证用户的数据安全，下面仅对漏洞做简单的描述，不提供任何漏洞复现指导。

### 1、[CRITICAL] 受保护的路径文件读取漏洞
在`/api/item`中，传入的参数`id`未经检查，可以通过该漏洞获取受保护的文件夹或文件ID、也可以获取受保护的文件内容。

### 2、SECRET_KEY泄露
而在`/onedrive-vercel-index-oauth/step-2/`、`/onedrive-vercel-index-oauth/step-3/`中，存在前端引用`/utils/oAuthHandler.ts`文件，这会直接导致`SECRET_KEY`的泄露。

### 3、后端鉴权漏洞
在`/onedrive-vercel-index-oauth/step-3/`中，存在一步操作，是将获取到的`access_token`和`refresh_token`提交给服务器，保存至`redis`。

分析程序代码可知，程序首先判断了登陆账号的用户名是否与设置的一致，若一致，则发送至服务器。然而，整个过程都是在前端完成的，而在后端代码中，不存在校验。也就是说，存在恶意提交覆盖原有`token`的风险。


## ⚠ 注意事项

由于经过二次开发，项目与先前项目已有不同，故存在以下需要注意的内容。

### protectedRoutes

如果您需要设置`protectedRoutes`，请务必设置**完整的**路径，即一定要包含末尾的`/`。例如`/protectedRoutes/`


## 🏞 定制您的站点

原项目的**全部**定制参数在本项目中依旧适用（具体参照[此处](https://ovi.swo.moe/zh/docs/custom-configs)）

### 自定义背景图片

通过更改`/app/public/bg.webp`来实现，若您需要修改图片的路径，可在`/app/src/styles/globals.css`中修改。
```css
body {
  background-image: url('/bg.webp');  /* 修改此处，/bg.webp对应/app/public/bg.webp，以此类推 */
  background-size: cover;
  background-repeat: no-repeat;
  background-color: #f2f2f2;
  background-attachment: fixed;
}
```

### 修改站点图标

您可以通过[该站点](https://www.favicon-generator.org/)生成一系列的图标用以替换。

该部分的代码实现位于`/app/src/pages/_document.tsx`


## ☁ Cloudflare 部署建议

若您使用了Cloudflare服务，可以添加规则如下的缓存规则来提高站点的访问速度（当该规则满足，则**缓存**响应内容）：

```text
(not starts_with(http.request.uri.path, "/api/")) and (not any(lower(http.request.headers.names[*])[*] eq "od-protected-token"))
```


## 🔐 安全政策

请参照[SECURITY.md](./SECURITY.md)

