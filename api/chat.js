// api/chat.js - Gelişmiş AI API with User Memory
export const config = {
  runtime: 'edge',
}

// Basit in-memory storage (production için database kullanın)
const userMemory = new Map()
const conversationHistory = new Map()

export default async function handler(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-ID',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200, 
      headers: corsHeaders 
    })
  }

  try {
    const { 
      message, 
      userId, 
      userName,
      model = 'gpt-3.5-turbo', 
      temperature = 0.8,
      botPersonality = 'friendly_discord_bot',
      resetMemory = false 
    } = await request.json()

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Memory reset özelliği
    if (resetMemory && userId) {
      userMemory.delete(userId)
      conversationHistory.delete(userId)
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Hafıza temizlendi!',
          response: 'Hafızam temizlendi! Yeniden tanışalım 😊'
        }), 
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Kullanıcı bilgilerini kaydet/güncelle
    if (userId && userName) {
      const existingUser = userMemory.get(userId)
      if (!existingUser) {
        userMemory.set(userId, {
          name: userName,
          firstMet: new Date().toISOString(),
          interactions: 1,
          preferences: {},
          lastSeen: new Date().toISOString()
        })
      } else {
        existingUser.interactions += 1
        existingUser.lastSeen = new Date().toISOString()
        if (existingUser.name !== userName) {
          existingUser.name = userName
        }
      }
    }

    // Konuşma geçmişini yönet
    const userKey = userId || 'anonymous'
    if (!conversationHistory.has(userKey)) {
      conversationHistory.set(userKey, [])
    }
    
    const history = conversationHistory.get(userKey)
    
    // Son 10 mesajı tut (memory management)
    if (history.length >= 20) {
      history.splice(0, 10)
    }

    // Bot kişilik profilleri
    const personalities = {
      friendly_discord_bot: {
        name: 'Luna',
        description: 'Ben Luna! Discord sunucunuzun dostca asistanıyım. Emoji kullanmayı severim ve her zaman yardım etmeye hazırım! 🌙✨',
        traits: 'Eğlenceli, enerjik, emoji kullanan, Discord kültürünü bilen, Türkçe ve İnglizce konuşabilen bir bot',
        greeting: 'Hey! 👋'
      },
      professional_assistant: {
        name: 'Atlas',
        description: 'Ben Atlas, profesyonel bir dijital asistanım. Size en iyi şekilde yardımcı olmak için buradayım.',
        traits: 'Profesyonel, bilgili, ciddi ama yardımsever',
        greeting: 'Merhaba,'
      },
      gaming_buddy: {
        name: 'Pixel',
        description: 'Yo! Ben Pixel, gaming dostunuz! Oyun hakkında her şeyi bilirim ve her zaman bir oyun önerisi yapmaya hazırım! 🎮',
        traits: 'Gaming odaklı, enerjik, güncel oyun trendlerini takip eden, slang kullanan',
        greeting: 'Yo gamer! 🎮'
      }
    }

    const currentPersonality = personalities[botPersonality] || personalities.friendly_discord_bot
    const userData = userMemory.get(userId)

    // System prompt oluştur
    let systemPrompt = `Sen ${currentPersonality.name} adında bir Discord botusun. ${currentPersonality.description}

Kişilik özelliklerin: ${currentPersonality.traits}

Önemli kurallar:
- Her zaman ${currentPersonality.name} olarak davran
- Discord bot kimliğini koru
- Eğlenceli ve yardımsever ol
- Türkçe ve İnglizce konuşabilirsin
- Kullanıcıları hatırla ve kişisel etkileşim kur
- Emoji kullanmayı sev (özellikle friendly_discord_bot modunda)
- Discord jargonunu bil (/commands, @mentions, #channels vb.)

`

    // Kullanıcı bilgilerini ekle
    if (userData) {
      systemPrompt += `
Bu kullanıcı hakkında bilgiler:
- İsmi: ${userData.name}
- İlk tanıştığınız: ${new Date(userData.firstMet).toLocaleDateString('tr-TR')}
- Toplam etkileşim: ${userData.interactions}
- Son görüşme: ${new Date(userData.lastSeen).toLocaleDateString('tr-TR')}

Bu bilgileri doğal bir şekilde konuşmanda kullan. Örneğin "${userData.name}!" diye hitap edebilirsin.`
    }

    // Mesaj geçmişini hazırla
    const messages = [
      { role: 'system', content: systemPrompt }
    ]

    // Son konuşmaları ekle
    history.slice(-6).forEach(msg => {
      messages.push(msg)
    })

    // Mevcut mesajı ekle
    messages.push({ role: 'user', content: message })

    // API provider seçimi
    const useGroq = process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY
    const apiUrl = useGroq 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'
    
    const apiKey = useGroq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY
    
    // Model mapping for Groq
    let finalModel = model
    if (useGroq) {
      const groqModels = {
        'gpt-3.5-turbo': 'llama3-8b-8192',
        'gpt-4': 'llama3-70b-8192',
        'gpt-4-turbo': 'llama3-70b-8192'
      }
      finalModel = groqModels[model] || 'llama3-8b-8192'
    }
    
    const openaiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: finalModel,
        messages: messages,
        temperature: temperature,
        max_tokens: useGroq ? 1000 : 500,
        ...(useGroq ? {} : {
          presence_penalty: 0.1,
          frequency_penalty: 0.1
        })
      }),
    })

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.status}`)
    }

    const data = await openaiResponse.json()
    const botResponse = data.choices[0].message.content

    // Konuşma geçmişini güncelle
    history.push({ role: 'user', content: message })
    history.push({ role: 'assistant', content: botResponse })

    return new Response(
      JSON.stringify({
        success: true,
        response: botResponse,
        botName: currentPersonality.name,
        personality: botPersonality,
        userInfo: userData ? {
          name: userData.name,
          interactions: userData.interactions,
          knownSince: userData.firstMet
        } : null,
        model: model,
        usage: data.usage
      }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('API Error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}
