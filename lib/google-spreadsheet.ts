import Stripe from 'stripe'
import { GoogleSpreadsheet } from 'google-spreadsheet'

interface SpectatorSheetRowProps {
  id: string
  name: string
  email: string
  quantity: number
  [key: string]: string | number
}

const addSpectatorSheetRow = async ({
  sheetId,
  checkoutSession
}: {
  sheetId: string
  checkoutSession: Stripe.Checkout.Session
}): Promise<void> => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2022-11-15'
  })

  const doc = new GoogleSpreadsheet(sheetId)

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  })

  await doc.loadInfo()

  for await (const line_item of stripe.checkout.sessions.listLineItems(
    checkoutSession.id
  )) {
    const sheet =
      doc.sheetsByTitle[line_item.description] ??
      (await doc.addSheet({
        headerValues: [
          'id',
          'name',
          'email',
          'quantity',
          ...checkoutSession.custom_fields.map((field) => field.key)
        ],
        title: line_item.description
      }))

    const row = {
      id: checkoutSession.id,
      name: checkoutSession.customer_details?.name,
      email: checkoutSession.customer_details?.email,
      quantity: line_item.quantity,
      ...checkoutSession.custom_fields.reduce(
        (acc, f) => ({ ...acc, [f.key]: f[f.type]?.['value'] }),
        {}
      )
    } as SpectatorSheetRowProps

    await sheet.addRow({ ...row })
  }
}

export { addSpectatorSheetRow }
