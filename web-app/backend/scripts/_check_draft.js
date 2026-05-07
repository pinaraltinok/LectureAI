const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const r=await p.report.findFirst({where:{draftReport:{path:['_analysisType'],equals:'student_voice'}}});
  console.log(JSON.stringify(r.draftReport,null,2));
  console.log('videoId field:', r.draftReport._videoId);
  console.log('lesson videoUrl:', r.lessonId);
  await p.$disconnect();
})();
