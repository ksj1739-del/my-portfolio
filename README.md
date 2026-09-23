# 내 포트폴리오 (안드로이드 웹 앱 · PWA)

엑셀 주식 시트를 대신하는 개인용 포트폴리오 앱. 데이터는 폰(브라우저 IndexedDB)에만 저장되고, 구글 연결 시 내 구글 드라이브에 자동 백업된다.

## 구성
| 경로 | 내용 |
|---|---|
| `index.html` | 진입점. React 18·htm을 import map(esm.sh)으로 불러온다(빌드 불필요) |
| `js/calc.js` | 계산 엔진(평가액·수수료·매도세·이동평균 평단·실현손익·비중) — 순수 함수 |
| `js/db.js`, `js/store.js` | IndexedDB 저장소, 업무 규칙(거래 기록·되돌리기·백업) |
| `js/google.js` | 구글 Apps Script 연동(시세 조회, 자동 백업, 복원) |
| `js/screens/*.js` | 화면(React 컴포넌트) |
| `sw.js`, `manifest.webmanifest`, `icons/` | 홈 화면 설치·오프라인 |
| `tests.html` | 계산 엔진 테스트(브라우저에서 열면 PASS/FAIL 표시) |
| `../apps-script/` | 구글 시세·백업 스크립트와 설치 안내 |

## 로컬 실행
```bash
python -m http.server 5173 --directory app
```
브라우저에서 `http://localhost:5173` (테스트: `/tests.html`).

## 폰에 설치(배포)
HTTPS 정적 호스팅이면 어디든 된다(예: GitHub Pages).
1. `app/` 폴더 내용을 저장소에 올리고 GitHub Pages를 켠다.
2. 폰 크롬에서 주소를 열고 메뉴 → **홈 화면에 추가**.
3. 앱 파일을 바꾸면 `sw.js`의 `VERSION`을 올린다(폰이 새 버전을 받도록).

## 참고
- React는 빌드 없이 CDN에서 불러온다. 처음 한 번은 인터넷이 필요하고, 이후에는 서비스워커가 캐시해 오프라인에서도 열린다.
- Node.js를 설치하면 Vite로 옮겨 번들링할 수 있다(htm 문법은 JSX와 거의 같아 옮기기 쉽다).
