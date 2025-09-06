const TelegramBot = require('node-telegram-bot-api');

// Configuration - use environment variables for Railway deployment
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHANNEL_ID = process.env.CHANNEL_ID || 'YOUR_CHANNEL_ID';

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Store pending users waiting for captcha verification
const pendingUsers = new Map();

// Suspicious keywords to check
const SUSPICIOUS_KEYWORDS = [
    'bot', 'police', 'telegram', 'remove', 'deleted'
];

// Username validation
function isValidUsername(username) {
    if (!username) return false;
    
    const lowerUsername = username.toLowerCase();
    for (const keyword of SUSPICIOUS_KEYWORDS) {
        if (lowerUsername.includes(keyword)) {
            return false;
        }
    }
    
    const usernamePattern = /^[a-zA-Z0-9_]{5,32}$/;
    return usernamePattern.test(username);
}

// Check profile for suspicious content
function hasCleanProfile(user) {
    const profileText = (user.first_name || '') + ' ' + (user.last_name || '') + ' ' + (user.username || '');
    const lowerProfile = profileText.toLowerCase();
    
    return !SUSPICIOUS_KEYWORDS.some(keyword => lowerProfile.includes(keyword));
}

// Check account age (30+ days old)
function isAccountOldEnough(userId) {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const estimatedCreationTime = (userId / 1000000) * 86400 * 1000;
    
    return estimatedCreationTime < thirtyDaysAgo;
}

// Generate simple math captcha
function generateCaptcha() {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operators = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * operators.length)];
    
    let answer;
    let question;
    
    switch(operator) {
        case '+':
            answer = num1 + num2;
            question = `${num1} + ${num2}`;
            break;
        case '-':
            answer = Math.abs(num1 - num2);
            question = `${Math.max(num1, num2)} - ${Math.min(num1, num2)}`;
            break;
        case '*':
            answer = num1 * num2;
            question = `${num1} × ${num2}`;
            break;
    }
    
    return { question, answer };
}

// Create inline keyboard for captcha
function createCaptchaKeyboard(correctAnswer) {
    // Generate 3 wrong answers
    const wrongAnswers = [];
    while (wrongAnswers.length < 3) {
        const wrong = correctAnswer + Math.floor(Math.random() * 20) - 10;
        if (wrong !== correctAnswer && wrong > 0 && !wrongAnswers.includes(wrong)) {
            wrongAnswers.push(wrong);
        }
    }
    
    // Mix all answers
    const allAnswers = [correctAnswer, ...wrongAnswers];
    const shuffled = allAnswers.sort(() => Math.random() - 0.5);
    
    // Create keyboard buttons
    const keyboard = shuffled.map(answer => ([{
        text: answer.toString(),
        callback_data: `captcha_${answer}`
    }]));
    
    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

// Basic validation (username, profile, age)
function passesBasicValidation(user) {
    const validUsername = isValidUsername(user.username);
    const cleanProfile = hasCleanProfile(user);
    const oldEnough = isAccountOldEnough(user.id);
    
    return validUsername && cleanProfile && oldEnough;
}

// Handle new members joining
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== CHANNEL_ID) return;

    for (const user of msg.new_chat_members) {
        if (user.is_bot) continue;

        console.log(`New user: ${user.username || user.first_name} (${user.id})`);

        // First check basic validations
        if (!passesBasicValidation(user)) {
            try {
                await bot.kickChatMember(chatId, user.id);
                await bot.unbanChatMember(chatId, user.id);
                console.log(`❌ User ${user.username || user.first_name} failed basic validation`);
            } catch (error) {
                console.error(`Error removing user ${user.id}:`, error);
            }
            continue;
        }

        // If basic validation passes, send captcha
        try {
            // Restrict user (mute them until captcha is solved)
            await bot.restrictChatMember(chatId, user.id, {
                can_send_messages: false,
                can_send_media_messages: false,
                can_send_polls: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false,
                can_change_info: false,
                can_invite_users: false,
                can_pin_messages: false
            });

            // Generate captcha
            const captcha = generateCaptcha();
            const keyboard = createCaptchaKeyboard(captcha.answer);

            // Send captcha message
            const captchaMsg = await bot.sendMessage(
                chatId,
                `🔐 Welcome ${user.first_name}!\n\nTo join this channel, please solve this simple math problem:\n\n**${captcha.question} = ?**\n\nClick the correct answer below:`,
                keyboard
            );

            // Store pending user data
            pendingUsers.set(user.id, {
                correctAnswer: captcha.answer,
                messageId: captchaMsg.message_id,
                joinTime: Date.now(),
                username: user.username || user.first_name
            });

            // Set timeout to remove user if no response in 2 minutes
            setTimeout(async () => {
                if (pendingUsers.has(user.id)) {
                    try {
                        await bot.kickChatMember(chatId, user.id);
                        await bot.unbanChatMember(chatId, user.id);
                        await bot.deleteMessage(chatId, captchaMsg.message_id);
                        pendingUsers.delete(user.id);
                        console.log(`⏰ User ${user.username || user.first_name} timed out`);
                    } catch (error) {
                        console.error(`Error handling timeout for user ${user.id}:`, error);
                    }
                }
            }, 120000); // 2 minutes

        } catch (error) {
            console.error(`Error setting up captcha for user ${user.id}:`, error);
        }
    }
});

// Handle captcha button clicks
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (chatId.toString() !== CHANNEL_ID) return;

    // Check if this is a captcha response
    if (data.startsWith('captcha_')) {
        const answer = parseInt(data.replace('captcha_', ''));
        const pending = pendingUsers.get(userId);

        if (!pending) {
            await bot.answerCallbackQuery(callbackQuery.id, 'Verification expired!');
            return;
        }

        if (answer === pending.correctAnswer) {
            // Correct answer - approve user
            try {
                // Remove restrictions (approve user)
                await bot.restrictChatMember(chatId, userId, {
                    can_send_messages: true,
                    can_send_media_messages: true,
                    can_send_polls: true,
                    can_send_other_messages: true,
                    can_add_web_page_previews: true,
                    can_change_info: false,
                    can_invite_users: false,
                    can_pin_messages: false
                });

                // Delete captcha message
                await bot.deleteMessage(chatId, pending.messageId);

                // Send welcome message
                await bot.sendMessage(
                    chatId,
                    `✅ Welcome ${callbackQuery.from.first_name}! You have been verified and can now participate in the channel.`
                );

                // Remove from pending
                pendingUsers.delete(userId);

                await bot.answerCallbackQuery(callbackQuery.id, '✅ Verified successfully!');
                console.log(`✅ User ${pending.username} passed captcha verification`);

            } catch (error) {
                console.error(`Error approving user ${userId}:`, error);
                await bot.answerCallbackQuery(callbackQuery.id, 'Error processing verification!');
            }

        } else {
            // Wrong answer - remove user
            try {
                await bot.kickChatMember(chatId, userId);
                await bot.unbanChatMember(chatId, userId);
                await bot.deleteMessage(chatId, pending.messageId);
                pendingUsers.delete(userId);

                await bot.answerCallbackQuery(callbackQuery.id, '❌ Wrong answer! You have been removed.');
                console.log(`❌ User ${pending.username} failed captcha verification`);

            } catch (error) {
                console.error(`Error removing user ${userId}:`, error);
                await bot.answerCallbackQuery(callbackQuery.id, 'Error processing verification!');
            }
        }
    }
});

// Clean up pending users on startup
setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of pendingUsers.entries()) {
        if (now - data.joinTime > 120000) { // 2 minutes
            pendingUsers.delete(userId);
        }
    }
}, 60000); // Check every minute

// Start the bot
console.log('Telegram validation bot with captcha started...');
console.log('Monitoring channel:', CHANNEL_ID);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Bot stopping...');
    bot.stopPolling();
    process.exit(0);
});
