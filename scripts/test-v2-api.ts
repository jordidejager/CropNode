import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testV2API() {
    const baseUrl = 'http://localhost:3000';
    
    const testInput = {
        rawInput: 'Alle appels met Merpan, maar de Kanzi ook met Score',
        previousDraft: null,
        chatHistory: [],
        parcelInfo: [],
    };
    
    console.log('=== Testing V2 API ===');
    console.log('Input:', testInput.rawInput);
    console.log('');
    
    try {
        const response = await fetch(`${baseUrl}/api/analyze-input`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testInput),
        });

        const reader = response.body?.getReader();
        if (!reader) {
            console.log('No response body');
            return;
        }

        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;

            // Parse lines
            const lines = chunk.split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const msg = JSON.parse(line);
                    console.log(`[${msg.type}]`, JSON.stringify(msg, null, 2).slice(0, 500));
                } catch { }
            }
        }
    } catch (e: any) {
        console.log('Error:', e.message);
    }
}

testV2API();
