// api/whatsapp-ingest.js

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'your_verify_token_here';
  const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  try {
    // ===== WEBHOOK VERIFICATION (GET REQUEST) =====
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      console.log('Webhook verification attempt:', { mode, token: token ? '***' : 'missing', challenge });

      if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
          console.log('✅ Webhook verified successfully!');
          return res.status(200).send(challenge);
        } else {
          console.error('❌ Verification token mismatch');
          return res.status(403).send('Forbidden');
        }
      }

      return res.status(400).send('Bad Request');
    }

    // ===== HANDLE INCOMING MESSAGES (POST REQUEST) =====
    if (req.method === 'POST') {
      const body = req.body;
      console.log('📨 Received webhook:', JSON.stringify(body, null, 2));

      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Check if this is a message
      if (value?.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const fromNumber = message.from;
        const messageBody = message.text?.body || '';
        const messageId = message.id;
        const messageType = message.type;

        console.log('📩 New message:', {
          from: fromNumber,
          type: messageType,
          body: messageBody,
          id: messageId
        });

        // Send auto-reply
        if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
          await sendWhatsAppMessage(fromNumber, `Thanks for your message: "${messageBody}". We received it!`);
        }

        // Mark message as read
        if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
          await markAsRead(messageId);
        }
      }

      // Check for message status updates
      if (value?.statuses && value.statuses.length > 0) {
        const status = value.statuses[0];
        console.log('📊 Message status update:', {
          id: status.id,
          status: status.status,
          timestamp: status.timestamp
        });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).send('Method Not Allowed');

  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return res.status(500).json({ error: error.message });
  }

  // ===== HELPER FUNCTIONS =====

  async function sendWhatsAppMessage(to, message) {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log('✅ Message sent successfully:', data);
        return data;
      } else {
        console.error('❌ Failed to send message:', data);
        throw new Error(data.error?.message || 'Failed to send message');
      }
    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }

  async function markAsRead(messageId) {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log('✅ Message marked as read');
      } else {
        const data = await response.json();
        console.error('❌ Failed to mark as read:', data);
      }
    } catch (error) {
      console.error('❌ Error marking as read:', error);
    }
  }
}
