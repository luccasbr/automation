import { PrismaClient } from '@prisma/client';
import { parsePhoneNumber } from '../whatsapp/utils';

export const prisma = new PrismaClient().$extends({
  result: {
    lead: {
      jid: {
        needs: { phone: true },
        compute(data) {
          return parsePhoneNumber(data.phone, 'jid');
        },
      },
    },
  },
});
