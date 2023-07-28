# onedrive-docker-index

A docker version of onedrive index, which is developed based on [ondrive-vercel-index](https://github.com/spencerwooo/onedrive-vercel-index) with bug fix.


## .env
To build the docker image, you should first create `.env` file.

Here's an example.
```env
NODE_ENV=production
NEXT_PUBLIC_USER_PRINCIPLE_NAME="Your Onedrive Username"
KV_PREFIX=GALBOX
REDIS_URL=redis://redis:6379
MS_CLIENT_ID="Your Client ID"
MS_CLIENT_SECRET="Your Client Secret"
SECRET_KEY="Your Secret Key"
```