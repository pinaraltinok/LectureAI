#!/bin/sh
set -e

echo "Waiting for database to start..."
sleep 3

echo "Applying Prisma schema changes..."
npx prisma db push

echo "Starting the application..."
npm run start
