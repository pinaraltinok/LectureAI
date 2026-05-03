# LectureAI Web-App Flow and State Machine

Bu dokuman, `web-app` klasorundeki frontend ve backend akisini inceleyerek
uygulamanin durum makinelerini ozetler.

## Incelenen ana dosyalar

- Frontend router ve oturum kabugu: `frontend/src/App.jsx`
- Login ekrani: `frontend/src/Login.jsx`
- Admin analiz akisi: `frontend/src/admin/AnalysisWorkflow.jsx`
- Ogrenci anket akisi: `frontend/src/student/StudentSurvey.jsx`
- Ogretmen mentorluk notu akisi: `frontend/src/teacher/TeacherAttendance.jsx`
- API giris noktasi: `backend/src/app.js`
- Auth, rol ve endpoint kapilari:
  - `backend/src/routes/auth.routes.js`
  - `backend/src/routes/admin.routes.js`
  - `backend/src/routes/teacher.routes.js`
  - `backend/src/routes/student.routes.js`
  - `backend/src/middleware/auth.js`
  - `backend/src/middleware/roleGuard.js`
- Veri durumlari: `backend/prisma/schema.prisma`

## Genel uygulama akisi

Frontend, `BrowserRouter` icinde tek bir `AppContent` kabugu calistirir.
Baslangicta `isLoggedIn=false` oldugu icin kullanici `Login` ekranindadir.
Login basarili olunca rol bilgisine gore ilgili panele yonlendirilir:

- `admin` -> `/admin/kurum-ozeti`
- `teacher` -> `/teacher/ders-ozeti`
- diger/default -> `/student/derslerim`

Login sonrasi sidebar role gore farkli menu gosterir. Sayfa icerigi ise
React Router route'lariyla degisir.

```mermaid
stateDiagram-v2
    [*] --> Anonymous

    Anonymous --> LoginForm: app acilir
    LoginForm --> LoginSubmitting: email + password / POST /api/auth/login
    LoginSubmitting --> LoginError: 400/401/500 veya network hata
    LoginError --> LoginForm: tekrar dene

    LoginSubmitting --> Authenticated: token alindi

    Authenticated --> AdminShell: role=admin
    Authenticated --> TeacherShell: role=teacher
    Authenticated --> StudentShell: role=student/default

    AdminShell --> AdminSummary: /admin/kurum-ozeti
    AdminShell --> TeacherPool: /admin/egitmen-havuzu
    AdminShell --> AnalysisAssignment: /admin/analiz-atama

    TeacherShell --> TeacherDashboard: /teacher/ders-ozeti
    TeacherShell --> TeacherFeedback: /teacher/feedback
    TeacherShell --> TeacherSurveys: /teacher/anketler

    StudentShell --> StudentDashboard: /student/derslerim
    StudentShell --> StudentSurvey: /student/anket
    StudentShell --> StudentNotes: /student/notlar

    AdminShell --> Anonymous: cikis yap
    TeacherShell --> Anonymous: cikis yap
    StudentShell --> Anonymous: cikis yap
```

## Auth ve rol kapisi

Backend tarafinda tum korumali endpoint'ler once JWT dogrulamasindan, sonra
rol kontrolunden gecer.

```mermaid
stateDiagram-v2
    [*] --> RequestReceived
    RequestReceived --> PublicEndpoint: /api/auth/login veya /health
    PublicEndpoint --> Response

    RequestReceived --> AuthRequired: korumali endpoint
    AuthRequired --> Unauthorized: Bearer token yok
    AuthRequired --> Unauthorized: token gecersiz/suresi dolmus
    AuthRequired --> RoleCheck: token dogrulandi
    RoleCheck --> Forbidden: rol endpoint icin uygun degil
    RoleCheck --> Controller: rol uygun
    Controller --> Response
```

## Admin analiz state machine

Veri modelinde `AnalysisJob.status` su durumlari tasir:

- `PENDING`: video yuklendi, is henuz atanmamis/kuyrukta.
- `PROCESSING`: egitmen ve ders ile eslesti, analiz uretiliyor.
- `DRAFT`: taslak rapor admin kontrolunde.
- `FINALIZED`: admin onayladi, rapor ogretmen/veli tarafina acilabilir.

Backend endpoint'leri bu ideal akisi destekler:

- `POST /api/admin/analysis/upload` -> `PENDING`
- `POST /api/admin/analysis/assign` -> `PROCESSING`
- `GET /api/admin/analysis/draft/:jobId` -> taslak okuma
- `POST /api/admin/analysis/regenerate` -> feedback ile tekrar `PROCESSING`
- `POST /api/admin/analysis/finalize` -> `FINALIZED`

Frontend'deki `AnalysisWorkflow` ise su an mock/timer tabanli bir UI state
kullaniyor: `upload`, `isAnalyzing`, `preview`, `success`.

```mermaid
stateDiagram-v2
    [*] --> Upload

    Upload --> Pending: video sec/yukle
    Pending --> Processing: egitmen + ders ata, analizi baslat
    Processing --> Draft: AI taslak rapor uretir
    Draft --> Processing: admin feedback ile yeniden olustur
    Draft --> Finalized: admin onaylar
    Finalized --> TeacherVisible: ogretmen raporlarinda gorunur
    Finalized --> ParentVisible: veli kalite onayinda gorunur

    TeacherVisible --> [*]
    ParentVisible --> [*]
```

Frontend'in mevcut ekran state'i:

```mermaid
stateDiagram-v2
    [*] --> UploadForm
    UploadForm --> Analyzing: Analizi Baslat
    Analyzing --> Preview: 3 saniye timer
    Preview --> Regenerating: adminNote varsa Feedback ile Yeniden Olustur
    Regenerating --> Preview: 3 saniye timer
    Preview --> Success: Raporu Onayla
    Success --> UploadForm: Yeni Bir Analiz Atamasi Yap
    Success --> TeacherPool: Egitmen Listesine Git
```

## Ogrenci akisi

Ogrenci panelinde ana durumlar:

- dersleri gorur
- anket ekranina gider
- 4 rating alanini doldurur
- opsiyonel yorum yazar
- form tamamlaninca submit aktif olur
- submit sonrasi basari ekranina gecer

Backend'deki kalici akis `POST /api/student/survey/submit` ile kurgulanmis:
ogrencinin derse kayitli olmasi gerekir ve ayni ders icin ikinci anket
engellenir.

```mermaid
stateDiagram-v2
    [*] --> Courses
    Courses --> SurveyForm: anket ac
    SurveyForm --> IncompleteSurvey: rating eksik
    IncompleteSurvey --> ReadyToSubmit: tum ratingler 1-5 arasi
    ReadyToSubmit --> Submitting: anket gonder
    Submitting --> Submitted: 201
    Submitting --> SurveyError: 400/403/409/500
    SurveyError --> SurveyForm: duzelt veya tekrar dene
    Submitted --> Courses: Derslerime Don
```

## Ogretmen akisi

Ogretmen panelinde iki ana is parcasi var:

1. Admin tarafindan final hale getirilmis analiz raporlarini gorur.
2. Ogrenciye mentorluk notu yazar ve gonderir.

Backend:

- `GET /api/teacher/reports` sadece `FINALIZED` analizleri getirir.
- `POST /api/teacher/mentor-feedback` ogrenciye not kaydeder.
- `GET /api/teacher/reports/:lessonId/surveys` anonim/agregre anket sonucunu getirir.

```mermaid
stateDiagram-v2
    [*] --> TeacherDashboard
    TeacherDashboard --> ReportsVisible: finalized raporlar
    TeacherDashboard --> StudentFeedbackList: /teacher/feedback

    StudentFeedbackList --> EditingNote: ogrenciye not yaz
    EditingNote --> ReadyToSend: note dolu
    ReadyToSend --> SendingNote: GONDER
    SendingNote --> SentTransient: UI'da iletildi
    SentTransient --> StudentFeedbackList: 3 saniye sonra temizle

    TeacherDashboard --> SurveyResults: /teacher/anketler
```

## Veli akisi

Backend'de veli icin endpoint'ler var, fakat frontend router'da parent paneli
su an baglanmamis. Planlanan backend akisi:

```mermaid
stateDiagram-v2
    [*] --> ParentAuthenticated
    ParentAuthenticated --> ChildOverview: /api/parent/student/overview
    ParentAuthenticated --> ChildMentorNotes: /api/parent/student/mentor-notes
    ParentAuthenticated --> QualityApprovals: /api/parent/quality-approvals
```

## Dikkat edilmesi gereken uyumsuzluklar

1. `Login.jsx`, basarili login sonrasi `data.user.role.toLowerCase()` bekliyor.
   Backend `auth.controller.js` ise `user` nesnesi yerine `role`, `userId`,
   `name` alanlarini top-level donuyor. Bu haliyle login basarili olsa bile
   frontend `data.user` undefined oldugu icin kirilabilir.
2. Frontend login rol tablari sadece placeholder ve gorsel rol secimi gibi
   duruyor; gercek rol backend'deki kullanici kaydindan geliyor.
3. `localStorage` token'a yaziliyor, fakat `App` reload sonrasi token'i okuyup
   `/api/auth/me` ile oturum restore etmiyor. Sayfa yenilenince UI tekrar
   login ekranina duser.
4. `AnalysisWorkflow`, backend analiz endpoint'lerine bagli degil; mock data ve
   `setTimeout` ile calisiyor. Gercek state machine backend'deki `AnalysisJob`
   status alanina baglanmali.
5. Backend controller'inda `regenerateAnalysis`, status'u `PROCESSING` yapiyor
   fakat tekrar `DRAFT` durumuna geciren bir worker/pipeline gorunmuyor.
6. Parent API var, ancak frontend'de parent role route/menu yok.

## Onerilen hedef mimari

Tek kaynak state backend olursa UI daha tutarli olur:

```mermaid
stateDiagram-v2
    [*] --> LoggedOut
    LoggedOut --> LoggedIn: /api/auth/login
    LoggedIn --> SessionRestored: refresh /api/auth/me
    LoggedIn --> LoggedOut: logout + token sil

    LoggedIn --> RoleHome: role route
    RoleHome --> AdminAnalysisJob
    RoleHome --> TeacherWorkspace
    RoleHome --> StudentWorkspace
    RoleHome --> ParentWorkspace

    state AdminAnalysisJob {
        [*] --> PENDING
        PENDING --> PROCESSING: assign
        PROCESSING --> DRAFT: AI draft ready
        DRAFT --> PROCESSING: regenerate
        DRAFT --> FINALIZED: finalize
    }
```
