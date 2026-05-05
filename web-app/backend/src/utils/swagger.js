const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LectureAI API',
      version: '3.0.0',
      description:
        'LectureAI Eğitim Platformu Backend API — Admin, Eğitmen, Öğrenci ve Veli rollerinin etkileşimlerini, AI analiz iş akışını ve mentorluk sistemini kapsar.',
      contact: {
        name: 'LectureAI Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token — Login endpoint\'inden alınır.',
        },
      },
      schemas: {
        // ─── Auth ────────────────────────────────────────────
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@lectureai.com' },
            password: { type: 'string', example: 'password123' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            role: { type: 'string', enum: ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] },
            userId: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
          },
        },
        UserProfile: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
          },
        },

        // ─── Admin ───────────────────────────────────────────
        AdminStats: {
          type: 'object',
          properties: {
            institutionScore: { type: 'number' },
            activeTeachers: { type: 'integer' },
            pendingAnalysis: { type: 'integer' },
            totalStudents: { type: 'integer' },
            totalLessons: { type: 'integer' },
          },
        },
        TeacherListItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            branch: { type: 'string' },
            lastScore: { type: 'number', nullable: true },
          },
        },
        UploadResponse: {
          type: 'object',
          properties: {
            jobId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            message: { type: 'string' },
          },
        },
        AssignRequest: {
          type: 'object',
          required: ['jobId', 'teacherId', 'lessonId'],
          properties: {
            jobId: { type: 'string', format: 'uuid' },
            teacherId: { type: 'string', format: 'uuid' },
            lessonId: { type: 'string', format: 'uuid' },
          },
        },
        DraftReport: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string' },
            draftReport: { type: 'object' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        RegenerateRequest: {
          type: 'object',
          required: ['jobId'],
          properties: {
            jobId: { type: 'string', format: 'uuid' },
            feedback: { type: 'string' },
          },
        },
        FinalizeRequest: {
          type: 'object',
          required: ['jobId'],
          properties: {
            jobId: { type: 'string', format: 'uuid' },
          },
        },

        // ─── Teacher ────────────────────────────────────────
        MentorFeedbackRequest: {
          type: 'object',
          required: ['studentId', 'note'],
          properties: {
            studentId: { type: 'string', format: 'uuid' },
            lessonId: { type: 'string', format: 'uuid' },
            note: { type: 'string' },
          },
        },
        MentorFeedbackItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            studentId: { type: 'string' },
            studentName: { type: 'string' },
            lessonId: { type: 'string' },
            note: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PersonalNoteRequest: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string' },
            lessonTag: { type: 'string' },
          },
        },
        SurveyAggregation: {
          type: 'object',
          properties: {
            lessonId: { type: 'string' },
            totalResponses: { type: 'integer' },
            averages: {
              type: 'object',
              properties: {
                contentQuality: { type: 'number' },
                teachingMethod: { type: 'number' },
                engagement: { type: 'number' },
                materials: { type: 'number' },
                overall: { type: 'number' },
              },
            },
            anonymousComments: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },

        // ─── Student ────────────────────────────────────────
        CourseItem: {
          type: 'object',
          properties: {
            lessonId: { type: 'string' },
            title: { type: 'string' },
            moduleCode: { type: 'string' },
            teacherName: { type: 'string' },
            hasSurvey: { type: 'boolean' },
          },
        },
        SurveySubmitRequest: {
          type: 'object',
          required: ['lessonId', 'contentQuality', 'teachingMethod', 'engagement', 'materials', 'overall'],
          properties: {
            lessonId: { type: 'string', format: 'uuid' },
            contentQuality: { type: 'integer', minimum: 1, maximum: 5 },
            teachingMethod: { type: 'integer', minimum: 1, maximum: 5 },
            engagement: { type: 'integer', minimum: 1, maximum: 5 },
            materials: { type: 'integer', minimum: 1, maximum: 5 },
            overall: { type: 'integer', minimum: 1, maximum: 5 },
            anonymousComment: { type: 'string' },
          },
        },

        // ─── Parent ─────────────────────────────────────────
        StudentOverview: {
          type: 'object',
          properties: {
            studentId: { type: 'string' },
            studentName: { type: 'string' },
            engagementLevel: { type: 'string' },
            badges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  earnedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        QualityApproval: {
          type: 'object',
          properties: {
            lessonTitle: { type: 'string' },
            moduleCode: { type: 'string' },
            status: { type: 'string' },
            score: { type: 'number', nullable: true },
            approvedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },

        // ─── Generic ────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        Success: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
