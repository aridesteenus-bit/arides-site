# ARIDES Cargo Mobile App And Dispatch System

## Current situation

Right now the site is a static landing page with a booking form that sends requests through `EmailJS`.

That is enough for a showcase website, but it is not enough for:

- real-time syncing between the site and a mobile app
- push notifications about new orders
- changing order status
- replying to the client from inside the system
- selecting a new available date and time
- GPS trip tracking
- mileage and loading/waiting-time history
- receipt generation and order archive

To make the mobile app work properly, the project needs a real backend and database.

## Recommended architecture

### Frontend

- Public website: current landing page, but the booking form should send data to backend instead of EmailJS
- Operator mobile app: for the owner/driver
- Optional admin web panel later: useful for desktop order management

### Recommended stack

- Mobile app: `React Native + Expo`
- Backend and database: `Supabase`
- Maps and route services: `Google Maps` or `Mapbox`
- Push notifications: `Expo Notifications`
- Authentication: `Supabase Auth`
- File storage: `Supabase Storage`

## Why this stack

This is the most practical path for this business:

- fast to build
- good real-time sync
- works well with notifications
- can store orders, statuses, GPS logs and receipts
- easier and cheaper than building a full custom backend from zero

## What should happen technically

### 1. Replace EmailJS with backend order creation

The website form should create a real order record in database.

Each order should store:

- client name
- phone
- email
- service type
- requested date
- requested time
- pickup address
- extra stops
- destination address
- cargo description
- notes
- loading/unloading help flag
- language
- source: `website`
- order status
- timestamps

### 2. Mobile operator app

The app should show:

- new incoming requests
- order details
- client contacts
- route addresses
- current status
- reply options
- history of previous jobs

### 3. Push notifications

When a new booking comes from the site:

- you get push notification on the phone
- the order appears in the app immediately

Notification example:

- `New order request from Mustamae tee 10 to Parnu mnt 120`

### 4. Order response flow

Inside the app you should be able to:

- accept the request
- reject the request
- propose another date and time
- mark the job as confirmed
- mark it as in progress
- mark it as completed

Useful quick actions:

- call client
- open WhatsApp
- open Telegram
- open route in maps
- send template reply

## Best useful features for your business

### Core MVP features

These are the features worth building first:

1. Real order database
2. Mobile app with login
3. Push notifications for new orders
4. Accept / reject / propose another time
5. Order statuses
6. Route open in navigation
7. Simple order history
8. Receipt mark and notes

### Strong business features

After MVP, these will be very useful:

- calendar of available time slots
- client history
- repeat clients
- tags: `private`, `business`, `moving`, `materials`, `waste`
- loading help note
- manual final price field
- payment status
- receipt PDF upload or generation

### GPS and trip tracking

This is possible and very useful if implemented correctly.

Recommended trip mode:

- you open the accepted order
- press `Start trip`
- app starts tracking phone GPS
- app logs movement in background while order is active
- you can switch status:
  - `Driving to pickup`
  - `At pickup`
  - `Loading`
  - `Driving to destination`
  - `Unloading`
  - `Completed`

From this, the system can calculate:

- total trip distance
- driving time
- loading/waiting time
- unloading time
- stop durations
- full order timeline

This is better than always-on tracking.

## Important GPS note

For iPhone and Android, reliable GPS tracking in the background is much better in a real mobile app than in a browser-based PWA.

So for this feature, a real mobile app is the correct solution.

Also important:

- tracking should only run during active orders
- you should explicitly start and stop it
- the app should store battery-friendly location samples

## Suggested database tables

### `orders`

- `id`
- `created_at`
- `updated_at`
- `status`
- `client_name`
- `client_phone`
- `client_email`
- `service_type`
- `requested_date`
- `requested_time`
- `confirmed_date`
- `confirmed_time`
- `pickup_address`
- `destination_address`
- `extra_stops_json`
- `cargo_details`
- `comment`
- `need_help`
- `language`
- `customer_type`
- `receipt_required`
- `final_price`
- `payment_status`
- `source`

### `order_status_history`

- `id`
- `order_id`
- `status`
- `note`
- `created_at`
- `created_by`

### `order_messages`

- `id`
- `order_id`
- `direction`
- `channel`
- `message_text`
- `created_at`

### `trip_sessions`

- `id`
- `order_id`
- `started_at`
- `ended_at`
- `total_km`
- `drive_minutes`
- `loading_minutes`
- `waiting_minutes`

### `trip_points`

- `id`
- `trip_session_id`
- `lat`
- `lng`
- `speed`
- `recorded_at`

## Mobile app screens

### Login

- phone/email login for operator

### Dashboard

- new orders
- today’s jobs
- accepted jobs
- completed jobs

### Order detail

- client info
- service type
- route
- comments
- cargo details
- buttons for quick actions

### Schedule action sheet

- accept current time
- propose another date
- propose another time
- write short note

### Trip tracker

- start trip
- pause
- loading
- unloading
- finish order
- view km and time summary

### History

- old jobs
- filters by date/status/client

## Recommended release stages

### Phase 1

- backend
- database
- website form connected to backend
- push notifications
- mobile app with order list and order detail

### Phase 2

- accept / reject / propose time
- status history
- calendar availability
- basic receipt workflow

### Phase 3

- GPS tracking
- trip timeline
- km and waiting analytics
- export/reporting

## Practical recommendation

Do not try to jump straight from the current static site to a full app with GPS in one step.

Best order:

1. Move booking data from `EmailJS` to real backend
2. Build operator app for incoming requests and notifications
3. Add scheduling and replies
4. Add GPS trip tracking

## What I recommend building next

The best next implementation step is:

### Build the backend foundation first

That means:

- create database schema
- connect website booking form to backend API
- add order statuses
- prepare app-ready order records

Once that is done, the mobile app becomes straightforward.
