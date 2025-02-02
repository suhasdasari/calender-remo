import { Context } from 'telegraf';
import { CallbackQuery } from 'telegraf/typings/core/types/typegram';
import { Telegram } from 'telegraf';
import { oauth2Client, storeUserToken } from './calendar';

// Store temporary tokens until user makes their choice
const tempTokens = new Map<string, any>();

export async function handleAuthCallback(code: string, state: string, telegram: Telegram) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    const userId = state;  // state contains the user ID from the auth process

    // Store tokens temporarily
    tempTokens.set(userId, tokens);

    // Ask user about authorization preference
    await telegram.sendMessage(userId, 
      '🔐 Authorization successful!\n\n' +
      'How would you like to handle authorization?\n\n' +
      '1️⃣ Allow for this session only (You\'ll need to reauthorize next time)\n' +
      '2️⃣ Always allow (Your access will be remembered)',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'This session only', callback_data: `auth_temp_${userId}` },
              { text: 'Always allow', callback_data: `auth_perm_${userId}` }
            ]
          ]
        }
      }
    );

    return tokens;
  } catch (error) {
    console.error('Error getting tokens:', error);
    await telegram.sendMessage(state, 'Failed to complete authorization. Please try again.');
    return null;
  }
}

export async function handleAuthChoice(ctx: Context, permanent: boolean) {
  try {
    const query = ctx.callbackQuery as CallbackQuery.DataQuery;
    if (!query?.data) return;

    const userId = query.data.split('_')[2];
    const tokens = tempTokens.get(userId);
    
    if (!tokens) {
      await ctx.editMessageText('❌ Authorization failed: No tokens found. Please try authorizing again.');
      return;
    }

    await storeUserToken(userId, tokens, permanent);
    tempTokens.delete(userId); // Clean up temporary tokens

    await ctx.editMessageText(
      permanent ? 
        '✅ Authorization successful! Your access will be remembered for future sessions.' :
        '✅ Authorization successful! You\'ll need to reauthorize in your next session.'
    );

    // Remove the inline keyboard
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

  } catch (error) {
    console.error('Error handling auth choice:', error);
    await ctx.editMessageText('❌ Failed to complete authorization. Please try again.');
  }
} 