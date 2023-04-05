const express = require('express')
const cors = require('cors')
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
app.use(cors())

// Starts the express server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)

    const parkName = PARK_NAMES[PARK_CODE]
    const formattedStartDate = dayjs(START_DATE).format('dddd, MMMM D')
    sendSMSMessage(PHONE_NUMBER, `Hi, I'm Bot Iger! I'll send you an alert when a park reservation opens for ${parkName} on ${formattedStartDate}.`)
    // Check for availability every 60 seconds
    setTimeout(() => {
        runAvailabilityChecker()
    }, 1000 * 60)
})

// Sends an alert upon park availability
async function runAvailabilityChecker() {
    try {
        const parkIsAvailable = await checkParkAvailability(PARK_CODE, START_DATE, END_DATE)
        if (parkIsAvailable) {
            const parkName = PARK_NAMES[PARK_CODE]
            await sendSMSMessage(PHONE_NUMBER, `🚨 There is an open park reservation at ${parkName} now!`)
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
            const res = await axios(`${WDW_CALENDAR_API_URL}/calendar?segment=tickets&startDate=${formattedStartDate}&endDate=${formattedEndDate}`).catch((err) => reject(err))

            if (!res || !res.data) {
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