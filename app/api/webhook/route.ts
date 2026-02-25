import { NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';

// LINE SDKのクライアント設定
const getLineClient = () => {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not defined in environment variables.');
  }
  return new line.messagingApi.MessagingApiClient({
    channelAccessToken,
  });
};

// JicooからのWebhookペイロードの型定義案
// ※ 実際のペイロードに合わせて調整可能なように柔軟に定義
interface JicooWebhookPayload {
  data?: {
    guest?: {
      name?: string;
      email?: string;
    };
    start_at?: string;
    end_at?: string;
    message?: string;
  };
  // フラットな構造の場合に備えるフォールバック
  guest_name?: string;
  email?: string;
  start_at?: string;
  end_at?: string;
  message?: string;
  [key: string]: any;
}

export async function POST(request: Request) {
  try {
    const payload: JicooWebhookPayload = await request.json();

    // 次のタスクで実装するメッセージ送信ロジックを呼び出すため、
    // ここではデータの受け取りと200OKの返却に専念します。
    // (デモ用として、LINE送信ロジックを直下または別関数に実装します)
    await processAndSendNotification(payload);

    // Jicoo側へ即座に `200 OK` を返却する
    return NextResponse.json({ status: 'success', message: 'Webhook received and processed.' }, { status: 200 });
  } catch (error) {
    console.error('❗️Webhook Error:', error);
    // システムがクラッシュしないよう、エラーを捕捉して200を返すか、500を返します。
    // Jicooへの無駄な再送を防ぐため、ここではエラーログを出力しつつ200(または500)で応答。
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}

async function processAndSendNotification(payload: any) {
  // 環境変数からLINEユーザーIDを取得
  const adminUserId = process.env.LINE_ADMIN_USER_ID;
  if (!adminUserId) {
    console.error('LINE_ADMIN_USER_ID is not set.');
    return;
  }

  console.log('--- Received Webhook Payload ---');
  console.log(JSON.stringify(payload, null, 2));
  console.log('--------------------------------');

  // Jicooのデータ構造から必要な情報を安全に抽出
  // 公式Webhook (payload.object) に対応しつつ、複数パターンで取得を試みる
  const obj = payload?.object || payload?.data || payload;
  const contact = obj?.contact || obj?.guest || {};

  const name = contact?.name || contact?.lastName || obj?.guest_name || '名前なし';
  const email = contact?.email || obj?.email || '不明';
  const startAt = obj?.startedAt || obj?.startAt || obj?.start_at || '不明';
  const endAt = obj?.endedAt || obj?.endAt || obj?.end_at || '';

  // messageの抽出 (answers配列に対応)
  let messageText = 'なし';

  // NOTE: 提供された payload では answers が [] となっているため、
  // ダッシュボードの設定で備考欄が「質問」として扱われているか、データに含まれていない可能性あり。
  // 念のため、payload内のどこかに message というキーがあれば拾い上げる柔軟な処理を追加。
  if (obj?.answers && Array.isArray(obj.answers) && obj.answers.length > 0) {
    messageText = obj.answers.map((a: any) => {
      if (typeof a === 'object') {
        const val = a.value || a.answer || a.text;
        const question = a.title || a.label || a.question;
        return question && val ? `【${question}】\n${val}` : (val || JSON.stringify(a));
      }
      return String(a);
    }).join('\n\n');
  } else if (obj?.message || payload?.message) {
    messageText = obj?.message || payload?.message;
  } else {
    // ペイロード全体をフラットに検索して 'message' や 'memo' などそれらしい値を探す最終手段
    const strPayload = JSON.stringify(payload);
    try {
      const match = strPayload.match(/"(message|memo|note|comment)":\s*"([^"]+)"/i);
      if (match && match[2]) {
        messageText = match[2];
      }
    } catch (e) { }
  }

  // 日時のフォーマット (例: 2026-02-27T06:00:00.000Z)
  let timeStr = startAt;
  if (startAt !== '不明') {
    try {
      const dOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo'
      };
      const startDate = new Date(startAt).toLocaleString('ja-JP', dOptions);
      const endDate = endAt ? new Date(endAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) : '';
      timeStr = endDate ? `${startDate}〜${endDate}` : startDate;
    } catch (e) {
      // 変換失敗時はそのまま表示
      timeStr = `${startAt}${endAt ? '〜' + endAt : ''}`;
    }
  }
  if (startAt !== '不明') {
    try {
      const dOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo'
      };
      const startDate = new Date(startAt).toLocaleString('ja-JP', dOptions);
      const endDate = endAt ? new Date(endAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) : '';
      timeStr = endDate ? `${startDate}〜${endDate}` : startDate;
    } catch (e) {
      // 変換失敗時はそのまま表示
      timeStr = `${startAt}${endAt ? '〜' + endAt : ''}`;
    }
  }

  // メッセージフォーマットの作成
  const textMessage = `【🔔 Jicoo 新規予約通知】
👤 お名前: ${name} 様
📅 日時: ${timeStr}
✉️ メール: ${email}
📝 メッセージ/備考:
${messageText}`;

  // LINEメッセージの送信
  try {
    const client = getLineClient();
    await client.pushMessage({
      to: adminUserId,
      messages: [
        {
          type: 'text',
          text: textMessage,
        }
      ]
    });
    console.log('✅ LINEへの通知を完了しました。');
  } catch (error) {
    console.error('❌ LINE API送信エラー:', error);
  }
}
