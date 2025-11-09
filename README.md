# BetPro Backend

Backend implementation for BetPro Exchange platform that integrates with Betfair API and MongoDB.

## Project Structure

```
BetPro_Backend/
├── api/
│   ├── __init__.py
│   ├── auth.py          # Authentication endpoints
│   ├── betfair_api.py   # Betfair API integration
│   ├── bets.py          # Betting endpoints
│   ├── markets.py       # Market data endpoints
│   └── user.py          # User account endpoints
├── database/
│   ├── __init__.py
│   └── db.py            # MongoDB connection
├── .env                 # Environment variables
├── app.py               # Main application entry point
├── requirements.txt     # Python dependencies
└── README.md            # Documentation
```

## Setup Instructions

### Prerequisites

- Python 3.8+
- MongoDB Atlas account
- Betfair API credentials

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd BetPro_Backend
```

2. Create a virtual environment:
```bash
python -m venv venv
```

3. Activate the virtual environment:
- Windows:
```bash
venv\Scripts\activate
```
- macOS/Linux:
```bash
source venv/bin/activate
```

4. Install dependencies:
```bash
pip install -r requirements.txt
```

5. Configure environment variables in `.env` file:
```
BETFAIR_APP_KEY=your_betfair_app_key
BETFAIR_SESSION_TOKEN=your_betfair_session_token
FLASK_ENV=development
DEBUG=True
HOST=localhost
PORT=5000
SECRET_KEY=your_secret_key
MONGODB_URI=your_mongodb_connection_string
```

6. Run the application:
```bash
python app.py
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user info

### Markets
- `GET /api/markets/sports` - Get all sports
- `GET /api/markets/competitions` - Get competitions for a sport
- `GET /api/markets/events` - Get events for a sport or competition
- `GET /api/markets/markets` - Get markets for an event
- `GET /api/markets/market/{market_id}` - Get market book for a market
- `GET /api/markets/popular` - Get popular markets

### Bets
- `POST /api/bets/place` - Place a bet
- `POST /api/bets/cancel/{bet_id}` - Cancel a bet
- `GET /api/bets/list` - List user bets
- `GET /api/bets/{bet_id}` - Get bet details

### User
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `PUT /api/user/change-password` - Change user password
- `GET /api/user/balance` - Get user balance
- `GET /api/user/transactions` - Get user transactions
- `POST /api/user/deposit` - Deposit funds
- `POST /api/user/withdraw` - Withdraw funds

## Integration with Frontend

This backend is designed to work seamlessly with the BetPro Exchange frontend. The API endpoints match the expected frontend requirements from www.bpexch.net.

## Security

- JWT authentication for API endpoints
- Password hashing with bcrypt
- Environment variables for sensitive information
