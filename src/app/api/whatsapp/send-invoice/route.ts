import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { customerPhone } = await req.json();

    const WHATSAPP_TOKEN = process.env.WHATSAPP_CLOUD_API_TOKEN;
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp credentials missing in .env.local' },
        { status: 500 }
      );
    }

    if (!customerPhone) {
      return NextResponse.json(
        { success: false, error: 'Customer phone number is required.' },
        { status: 400 }
      );
    }

    const formattedPhone = customerPhone.replace(/\D/g, '');

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'template',
          template: {
            name: 'hello_world', 
            language: { code: 'en_US' },
          },
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to send WhatsApp message.');
    }

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}