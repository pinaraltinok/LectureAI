const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║         🎓 LectureAI Backend Server              ║
  ║──────────────────────────────────────────────────║
  ║  API:      http://localhost:${PORT}                ║
  ║  Swagger:  http://localhost:${PORT}/api-docs       ║
  ║  Health:   http://localhost:${PORT}/health          ║
  ╚══════════════════════════════════════════════════╝
  `);
});
