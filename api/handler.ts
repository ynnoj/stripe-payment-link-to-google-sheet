import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Readable } from 'node:stream'

import Stripe from 'stripe'
import { addSpectatorSheetRow } from '../lib/google-spreadsheet'

export const config = {
  api: {
    bodyParser: false
  }
}

const buffer = async (readable: Readable) => {
  const chunks: any[] = []

  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return Buffer.concat(chunks)
}

const verifyStripeSignature =
  (
    handler: (
      req: VercelRequest,
      res: VercelResponse,
      event: Stripe.Event
    ) => void
  ) =>
  async (req: VercelRequest, res: VercelResponse) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2022-11-15'
    })

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(
        await buffer(req),
        req.headers['stripe-signature']!,
        process.env.STRIPE_WEBHOOK_SECRET!
      )

      return handler(req, res, event)
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  }

async function handler(
  req: VercelRequest,
  res: VercelResponse,
  event: Stripe.Event
) {
  if (!req.query?.google_sheet_id)
    throw new Error(
      'Please provide a Google Sheet ID via the URL query parameters (?google_sheet_id=xyz)'
    )

  const permittedEvents: string[] = ['checkout.session.completed']

  if (req.method === 'POST') {
    if (permittedEvents.includes(event.type)) {
      try {
        switch (event.type) {
          case 'checkout.session.completed':
            await addSpectatorSheetRow({
              sheetId: req.query.google_sheet_id as string,
              checkoutSession: event.data.object as Stripe.Checkout.Session
            })
            break
          default:
            throw new Error(`Unhhandled event: ${event.type}`)
        }
      } catch (error) {
        console.log(error)
        return res.status(500).json({ message: 'Webhook handler failed' })
      }
    }

    return res.status(200).json({ message: 'Received' })
  } else {
    res.status(405).json({ message: 'Method not allowed' })
  }
}

export default verifyStripeSignature(handler)
