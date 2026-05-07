/**
 * Re-trigger student voice analysis via PubSub
 */
const { PubSub } = require('@google-cloud/pubsub');

const pubsub = new PubSub({ projectId: 'senior-design-488908' });
const TOPIC = 'student-analysis-requested';

async function main() {
  const message = {
    video_id: '1777882338202___3L1_Flask-Sanal_ortam___yap__land__rma',
    student_name: 'Kağan Efe Tezcan',
    video_blob: 'Lesson_Records/1777882338202___3L1_Flask-Sanal_ortam___yap__land__rma.mp4',
    reference_audio_blob: 'kaganefetezcan.mp3',
  };

  const topic = pubsub.topic(TOPIC);
  const dataBuffer = Buffer.from(JSON.stringify(message));
  const messageId = await topic.publishMessage({ data: dataBuffer });
  console.log(`✅ PubSub message published: ${messageId}`);
}

main().catch(console.error);
