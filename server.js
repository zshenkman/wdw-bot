const express = require('express')
const cors = require('cors')
const Sentry = require('@sentry/node')
const Tracing = require('@sentry/tracing')
const https = require('https')
const axios = require('axios').default
const dayjs = require('dayjs')
const dotenv = require('dotenv')
dotenv.config()

// Twilio SMS configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN =  process.env.TWILIO_AUTH_TOKEN
const TWILIO_PHONE_NUMBER = '+18444197426'
const twilioClient = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

// Temporary constants
const WDW_CALENDAR_API_URL = 'https://disneyworld.disney.go.com/availability-calendar/api'
const PARK_CODE = 80007944  // API code for Magic Kingdom
const START_DATE = dayjs('2023-04-08')  // April 8, 2023
const END_DATE = dayjs('2023-04-08')  // April 8, 2023
const PHONE_NUMBER = process.env.SUBSCRIBED_PHONE_NUMBER  // Phone number to send alerts to

const PARK_NAMES = {
    80007944: 'Magic Kingdom',
    80007998: 'Disney\'sHollywood Studios',
    80007823: 'Epcot',
    80007838: 'Animal Kingdom'
}

// Configures Express app
const PORT = process.env.PORT || 8000
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cors())

// Configures Sentry
const SENTRY_DSN = process.env.SENTRY_DSN
Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [
        // enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // enable Express.js middleware tracing
        new Tracing.Integrations.Express({ app }),
        // Automatically instrument Node.js libraries and frameworks
        ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations()
    ],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0
})
// RequestHandler creates a separate execution context using domains, so that every
// transaction/span/breadcrumb is attached to its own Hub instance
app.use(Sentry.Handlers.requestHandler())
// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler())

axios.defaults.headers.common['Accept-Encoding'] = '*'

// Starts the express server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)

    const parkName = PARK_NAMES[PARK_CODE]
    const formattedStartDate = dayjs(START_DATE).format('dddd, MMMM D')
    sendSMSMessage(PHONE_NUMBER, `Hi, I'm Bot Iger! I'll send you an alert when a park reservation opens for ${parkName} on ${formattedStartDate}.`)
    // Check for availability every 60 seconds
    setInterval(() => {
        runAvailabilityChecker()
    }, 1000 * 60)
})

// Sends an alert upon park availability
async function runAvailabilityChecker() {
    try {
        const parkIsAvailable = await checkParkAvailability(PARK_CODE, START_DATE, END_DATE)
        const parkName = PARK_NAMES[PARK_CODE]
        if (parkIsAvailable) {
            console.log(`Availability found at ${parkName}!`)
            await sendSMSMessage(PHONE_NUMBER, `🚨 There is an open park reservation at ${parkName} now!`)
        } else {
            console.log(`No availability found at ${parkName}.`)
        }
    } catch (err) {
        console.log(`ERROR: ${err.message}`)
    }
}

// Queries WDW API in date range and checks for park availability
async function checkParkAvailability(parkCode, startDate, endDate) {
    return new Promise(async (resolve, reject) => {
        try {
            const formattedStartDate = dayjs(startDate).format('YYYY-MM-DD')
            const formattedEndDate = dayjs(endDate).format('YYYY-MM-DD')
            const res = await axios({
                url: `${WDW_CALENDAR_API_URL}/calendar?segment=tickets&startDate=${formattedStartDate}&endDate=${formattedEndDate}`,
                method: 'GET',
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            }).catch((err) => reject(err))

            if (!res || !res.data) {
                console.log(res)
                reject(new Error(`Invalid response received from WDW API.`))
            }

            if (res.status !== 200) {
                reject(new Error(`Error ${res.status} encountered while querying WDW API.`))
            }
            
            // Checks response for available park reservations
            const parkIsAvailable = false
            for (const reservationWindow of res.data) {
                const { availability, parks } = reservationWindow
                if (availability == 'full' || parks.includes(parkCode)) {
                    parkIsAvailable = true
                    break
                }
            }

            resolve(parkIsAvailable)
        } catch (err) {
            reject(err)
        }
    })
}

// Sends SMS message via Twilio
async function sendSMSMessage(phoneNumber, message) {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await twilioClient.messages.create({
                from: TWILIO_PHONE_NUMBER,
                to: PHONE_NUMBER,
                body: message
            }).catch((err) => reject(err))

            console.log(`SMS message ${res.sid} sent to ${phoneNumber}`)
            resolve()
        } catch (err) {
            reject(err)
        }
    })
}