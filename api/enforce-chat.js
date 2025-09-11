import axios from "axios";

let userMemory = {}; // Kullanıcı bazlı hafıza

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { user_name, message, personality } = req.body;

    if (!user_name || !message) {
        return res.status(400).json({ error: "user_name ve message gerekli" });
    }

    // Son 15 mesajı sakla
    const history = userMemory[user_name] || [];

    const systemPrompt = personality || `Sen EnForce Discord botusun. Kullanıcı adı: ${user_name}. Dostane, yardımsever ve gerektiğinde hafif sarkastik ol. Komutlar ve hata çözümü hakkında bilgi ver.`;

    const payload = {
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message }
        ]
    };

    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            payload,
            {
                headers: {
                    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const reply = response.data.choices[0].message.content;

        // Hafızaya ekle
        history.push({ role: "user", content: message });
        history.push({ role: "assistant", content: reply });
        userMemory[user_name] = history.slice(-15);

        return res.status(200).json({ reply });
    } catch (err) {
        return res.status(500).json({ error: err.response?.data || err.message });
    }
}
