# Deploy (FastAPI + React) via Docker

## 1) Chuẩn bị server (máy mới hoàn toàn)

SSH vào server (cổng SSH của bạn là `4567`):

```bash
ssh -p 4567 thinh@54.179.246.223
```

### Cài Docker + Compose

#### Debian 13 (trixie) — khuyến nghị dùng package của Debian

> Nếu bạn từng thêm repo `download.docker.com/linux/ubuntu` trên Debian và bị lỗi `404 Not Found`, hãy xoá file repo đó trước:
>
> ```bash
> sudo rm -f /etc/apt/sources.list.d/docker.list
> sudo apt-get update
> ```

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

Nếu máy bạn không có `docker compose` sau khi cài, hãy dùng `docker-compose`:

```bash
sudo apt-get install -y docker-compose
docker-compose --version
```

#### Ubuntu/Debian (cài theo repo Docker chính thức)

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Mở firewall/security-group cho HTTP (80) hoặc port bạn muốn.

## 2) Copy source lên server

Một cách đơn giản là dùng git:

```bash
sudo apt-get install -y git
git clone <repo-url>
cd <repo-folder>
```

Hoặc dùng `rsync/scp` từ máy bạn.

## 3) Tạo file `.env`

```bash
cp .env.example .env
nano .env
```

Nhớ đổi `JWT_SECRET`.

Nếu bạn dùng HTTPS (Let’s Encrypt/Nginx…), set:

```env
COOKIE_SECURE=true
```

## 4) Chạy app

```bash
docker compose up -d --build
```

Kiểm tra:

```bash
docker compose ps
docker compose logs -f --tail=200 backend
docker compose logs -f --tail=200 web
```

## 5) Khởi tạo DB (lần đầu)

Mặc định compose dùng SQLite trong volume `backend_data`.

Chạy migrate + seed:

```bash
docker compose exec backend python -m app.db.init_db
docker compose exec backend python -m app.db.seed_db
```

Tài khoản seed mặc định nằm trong `backend/app/db/seed_db.py`.

## 6) Update deploy (khi có code mới)

```bash
git pull
docker compose up -d --build
```
