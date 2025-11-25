# PayScope Suite

SpendMate OCR 서비스 전체를 한 리포지터리에서 관리하기 위한 멀티 프로젝트 워크스페이스입니다.

- **frontend/** – Vite + React 기반 사용자/Admin SPA
- **spendmate/** – Django + MongoDB API (인증, 지출 관리, 관리자 기능)
- **spendmate-ocr/** – Flask + PaddleOCR 영수증 추출 마이크로서비스

각 폴더는 자체 의존성(node_modules, virtualenv 등)을 유지하지만, 하나의 저장소에서 함께 버전 관리되어 프런트/백 변경을 동시에 기록할 수 있습니다.

## Project Structure / 프로젝트 구조
```
PayScope/
├── README.md (this file)
├── frontend/        # React client (Vite)
├── spendmate/       # Django REST API + MongoDB
└── spendmate-ocr/   # OCR microservice (Flask + PaddleOCR)
```

## Requirements / 개발 환경
- macOS or Linux shell (tested on macOS/zsh)
- **Node.js 18+** for the React app (use nvm or brew)
- **Python 3.11** recommended for both Django and Flask services
- **MongoDB** (Atlas or local) – configure connection in `spendmate/.env`
- Optional: virtualenv for each backend (`python3 -m venv venv`)

## Quick Start / 실행 방법
1. **Clone & enter the repo**
   ```bash
   git clone https://github.com/pjunese/PayScope.git
   cd PayScope
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   # Vite dev server on http://127.0.0.1:5173
   ```

3. **Django API (spendmate)**
   ```bash
   cd spendmate
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env  # Mongo + OAuth secrets 입력
   python manage.py migrate
   python manage.py runserver 0.0.0.0:8000
   ```

4. **OCR microservice**
   ```bash
   cd spendmate-ocr
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env  # PaddleOCR/Clova 설정
   python3 app.py
   ```

React 앱은 기본적으로 Django API를 `http://127.0.0.1:8000`, OCR 서비스를 `http://127.0.0.1:5000` 으로 가정합니다 (필요 시 `.env`에서 수정).

## Environment Notes / 기타 메모
- 각 서브 프로젝트마다 `.gitignore`가 있으므로 `venv/`, `.env`, `node_modules/`, `uploads/` 등이 커밋되지 않습니다.
- 배포 시에는 폴더별로 별도 서비스로 취급하면 됩니다 (예: frontend = Vercel, API = Render/Railway 등).

## License
MIT (추후 확정 예정).
