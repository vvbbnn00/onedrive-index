# Onedrive Docker Index

[中文](./README.md) | English

## 🤔 What is this?

This project is a secondary development based on [ondrive-vercel-index](https://github.com/spencerwooo/onedrive-vercel-index). Since the original project is already in an `Archive` state, the main purpose of this project is to fix serious security vulnerabilities in the original project (see [Security Issue Fixes](#-Security-Issue-Fixes)), optimize the interface and performance, and provide a deployment solution in a `Docker` environment. This project inherits all the features of the original project, and you can refer to the [original project's documentation](https://ovi.swo.moe/zh/docs/getting-started) for customization.

As a **very amateur front-end and back-end developer**, I am not as skilled as the great developers who participated in the development of the original project, so I cannot guarantee the quality of this forked project. Also, because the initial purpose of this project was to build my own personal site, it contains many customized content that you can adjust as needed. You can find help on customizing your site in the [Customize Your Site](#-Customize-Your-Site) section below.

## ❓ How is it different from `onedrive-vercel-index`?

- Fixed several [security issues](#-Security-Issue-Fixes)
- Provided a Docker deployment solution
- Improved Redis cache utilization and website performance
- Enhanced user security
- Improved interface display (supports custom background images, etc.)
- ...

## 🎉 Quick Start

Although it's a quick start, the actual operation process of this project is indeed more complicated compared to the original project.

### Step 1
Clone this project to your server and obtain your own `ClientID` and `ClientSecret`.

Refer to the [original project tutorial](https://ovi.swo.moe/zh/docs/advanced) for the method to obtain them.

**However, unlike the original tutorial, the obtained `ClientSecret` does not need to be encrypted! Please directly fill in the unencrypted `ClientID` and `ClientSecret` in Step 2!**


### Step 2
Create a `.env` file in the root directory of the project with the following content:
```env
NODE_ENV=production  # Deployment environment, default to production mode, no need to change
NEXT_PUBLIC_USER_PRINCIPLE_NAME=Your Onedrive Username  # Your Onedrive account used for binding
KV_PREFIX=GALBOX  # Prefix for Redis storage, you can modify it according to your situation
REDIS_URL=redis://redis:6379  # Normally no need to modify, if you need to use an external Redis service, you need to fill in
MS_CLIENT_ID=Your Client ID  # Your ClientID
MS_CLIENT_SECRET=Your Client Secret  # Your ClientSecret
SECRET_KEY=Your Secret Key  # Secret Key used for AES encryption, it must be kept absolutely confidential
```
**Note that `ClientSecret` is unencrypted!**

### Step 3

Choose the appropriate command according to your system, and run the command to build and start the image.

**Linux system:**
```shell
chmod +x ./build.sh
./build.sh
```

**Windows system:**
```shell
./build.bat
```

### Step 4
The project has been built, and the port is `20011`. However, we recommend using Nginx reverse proxy to provide services. Below is an example of reverse proxy configuration:
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
The following steps are exactly the same as the original tutorial, [click here to view](https://ovi.swo.moe/zh/docs/getting-started#%E8%BF%9B%E8%A1%8C%E8%AE%A4%E8%AF%81) (in Chinese).

🎉 Congratulations! You have completed the deployment!


## ❗ Security Issue Fixes

> **Do not use any vulnerabilities described below to attack any servers!**

This project has fixed some serious security issues in `onedrive-vercel-index`. For the sake of users' data security, below are simple descriptions of the vulnerabilities without providing any guidance for exploiting them.

### 1. [CRITICAL] Protected Path File Read Vulnerability
In `/api/item`, the parameter `id` is not checked and can be exploited to obtain the IDs of protected folders or files, as well as the contents of protected files.

### 2. SECRET_KEY Leakage
In `/onedrive-vercel-index-oauth/step-2/` and `/onedrive-vercel-index-oauth/step-3/`, the frontend references the file `/utils/oAuthHandler.ts`, which directly leads to the leakage of `SECRET_KEY`.

### 3. Backend Authentication Vulnerability
In `/onedrive-vercel-index-oauth/step-3/`, there is a step where the obtained `access_token` and `refresh_token` are submitted to the server and saved to `redis`.

By analyzing the code, it can be seen that the program first checks whether the username of the login account matches the one set, and if so, sends the tokens to the server. However, the entire process is completed on the frontend, and there is no verification in the backend code. This means that there is a risk of malicious submissions overwriting the existing tokens.

## ⚠ Precautions

Due to the secondary development, there are some differences from the original project, so please pay attention to the following points.

### protectedRoutes

If you need to set `protectedRoutes`, be sure to set the **complete** path, including the trailing `/`. For example, `/protectedRoutes/`

## 🏞 Customize Your Site

All the custom parameters of the original project are still applicable in this project (refer to [here](https://ovi.swo.moe/zh/docs/custom-configs) for details).

### Customize Background Image

You can modify `/app/public/bg.webp` to change the background image. If you need to modify the image path, you can do so in `/app/src/styles/globals.css`.
```css
body {
  background-image: url('/bg.webp');  /* Change it here, /bg.webp corresponds to /app/public/bg.webp, and so on */
  background-size: cover;
  background-repeat: no-repeat;
  background-color: #f2f2f2;
  background-attachment: fixed;
}
```

### Change Site Icon

You can generate a series of icons to replace them through [this site](https://www.favicon-generator.org/).

The code for this part is in `/app/src/pages/_document.tsx`.


## ☁ Cloudflare Deployment Suggestions

If you are using Cloudflare service, you can add the following cache rule to improve the site's access speed (when this rule is met, the response content will be **cached**):

```text
(not starts_with(http.request.uri.path, "/api/")) and (not any(lower(http.request.headers.names[*])[*] eq "od-protected-token"))
```

## 🔐 Security Policy

Please refer to [SECURITY.md](./SECURITY.md).