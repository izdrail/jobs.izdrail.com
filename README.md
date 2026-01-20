# Jobs.izdrail.com - The Job Search Engine That Doesn't Suck

Welcome to the most overengineered job search engine you'll ever deploy. We've taken the simple concept of "find jobs" and wrapped it in Docker, Python, FastAPI, and enough dependencies to make your package manager weep.

## What Is This Thing?

This is a job search engine with no ads and no fuss. Just pure, unadulterated job listings served fresh from the API oven at port 8003. Think of it as the anti-LinkedIn - we don't care about your professional network, we just want to help you find a job so you can afford ramen that isn't the 25-cent kind.

## Prerequisites (AKA "Stuff You Need Before You Start")

Before you embark on this journey, make sure you have:

- **Docker**: Because running things natively is so 2015
- **Docker Compose**: For when one Docker isn't enough
- **Make**: The build tool that's older than your programming career
- **A sense of humor**: Required for reading this README
- **Coffee**: Not technically required, but highly recommended
- **Patience**: Docker builds can take longer than a job interview

## The Sacred Makefile Commands

Our project uses a Makefile because we're fancy like that. Here are the incantations you can perform:

### `make build` - The Nuclear Option

```bash
make build
```

This command will:
1. Violently remove the existing Docker image (if it exists)
2. Build a fresh new image with more layers than a wedding cake
3. Install Python 3.11, Node.js, npm, Maven, Chromium, and enough other stuff to run a small country
4. Download half the internet via pip and npm
5. Install Zsh with a fancy spaceship prompt because we're developers and we have standards
6. Spin up the container and pray to the Docker gods

**Warning**: This command is like doing a clean install of Windows - it fixes everything but takes forever. Use when things are really broken or when you want to take a long coffee break.

### `make dev` - The "I Just Want It To Work" Command

```bash
make dev
```

This is your bread and butter. It starts the Docker Compose stack without rebuilding everything. Use this when:
- You've already built the image
- You're actively developing
- You don't hate yourself enough to run `make build` again

### `make down` - The Rage Quit

```bash
make down
```

Stops all containers. Use when:
- You're done for the day
- Everything is on fire
- You need to free up port 8003 for something else
- Your laptop is about to achieve liftoff from CPU usage

### `make ssh` - The Hacker Mode

```bash
make ssh
```

Opens a Zsh shell inside the running container. Now you can:
- Pretend you're in The Matrix
- Debug things the hard way
- Run commands manually like a caveman
- Feel superior because you're using Zsh with a spaceship prompt

### `make publish` - The "Ship It" Button

```bash
make publish
```

Pushes your Docker image to Docker Hub. Only use this when:
- You're absolutely sure it works
- You've tested everything
- You're ready to share your creation with the world
- You want to brag about your Docker Hub stats

## The Full Build and Deploy Journey

Here's the complete saga from zero to hero:

### Step 1: Clone This Bad Boy

```bash
git clone https://github.com/izdrail/jobs.izdrail.com.git
cd jobs.izdrail.com
```

### Step 2: Build The Image (Grab a Snack)

```bash
make build
```

Go make yourself a sandwich. A slow one. With homemade bread. This will take a while because we're:
- Installing an entire operating system
- Downloading Python packages that have dependencies that have dependencies
- Installing Node.js packages globally
- Downloading NLTK data
- Installing Zsh plugins because we're extra
- Compiling things that probably don't need to be compiled

### Step 3: Watch It Run

Once the build completes (congratulations, you're still awake!), the container will automatically start. You should see:
- Supervisord starting up
- The FastAPI application launching
- Port 8003 being exposed to the world
- Your CPU fan spinning up

### Step 4: Test It

Open your browser and navigate to:
```
http://localhost:8003
```

You should see the glorious static HTML page. If you see it, congratulations! You've successfully deployed a job search engine. If you don't see it, well... try `make down` and `make dev` again.

### Step 5: Check the API Docs

Because we're using FastAPI, you get free API documentation:
```
http://localhost:8003/docs
```

It's like magic, but with more JSON.

## Daily Development Workflow

For those of you who will actually be working on this:

```bash
# Morning: Start everything
make dev

# During the day: Make changes to code
# The container has volumes mounted, so changes appear automatically

# Need to debug? Jump inside
make ssh

# Evening: Shut it down
make down

# Something broke? Nuke it from orbit
make build
```

## Deployment to Production

When you're ready to deploy this masterpiece:

1. **Push to GitHub**:
   ```bash
   git push origin main
   ```

2. **GitHub Actions Takes Over**:
   - Automatically builds the Docker image
   - Pushes to Docker Hub as `izdrail/jobs.izdrail.com:latest`
   - Does all this without you lifting a finger

3. **Pull and Run on Your Server**:
   ```bash
   docker pull izdrail/jobs.izdrail.com:latest
   docker run -d -p 8003:8003 izdrail/jobs.izdrail.com:latest
   ```

4. **Or Use Docker Compose** (recommended):
   ```bash
   # On your production server
   git pull origin main
   docker-compose up -d
   ```

## Architecture (For the Nerds)

- **Language**: Python 3.11 (because 3.10 is so last year)
- **Framework**: FastAPI (fast in name, fast in nature)
- **Server**: Uvicorn (because Gunicorn was too mainstream)
- **Process Manager**: Supervisord (keeping your processes in line since 2004)
- **Container**: Docker (because "it works on my machine" isn't good enough)
- **Shell**: Zsh with Spaceship prompt (for maximum developer street cred)
- **Port**: 8003 (because 8000-8002 were taken)

## Dependencies Explained

We have more dependencies than a soap opera character:

- **FastAPI**: The web framework that makes you feel fast
- **Selenium**: For when you need to pretend to be a browser
- **NLTK & TextBlob**: Natural language processing (we're fancy)
- **VaderSentiment**: For analyzing how sad job descriptions make you
- **Lighthouse**: For checking if websites are any good
- **Chromium**: A whole browser, just sitting there
- **Maven**: Because apparently we need Java too
- **And many more**: Check `requirements.txt` if you're brave

## Troubleshooting

### "It doesn't work!"
Try `make down` then `make build`. If that doesn't work, try turning it off and on again.

### "Port 8003 is already in use!"
Something else is using your port. Find it and kill it:
```bash
lsof -ti:8003 | xargs kill -9
```

### "Docker build failed!"
Check your internet connection. We're downloading half of PyPI.

### "I'm getting import errors!"
Did you rebuild after changing `requirements.txt`? Run `make build`.

### "The container keeps crashing!"
Check the logs:
```bash
docker logs jobs.izdrail.com
```

### "I've tried everything and it still doesn't work!"
Have you tried:
1. Restarting Docker?
2. Restarting your computer?
3. Questioning your life choices?
4. Reading the actual error message?

## Contributing

Found a bug? Want to add a feature? PRs are welcome! Just make sure:
- Your code works (revolutionary concept, I know)
- You've tested it locally
- You haven't broken everything else
- You've updated this README if needed

## Support This Project

If this project saved you time, made you laugh, or helped you find a job, consider supporting the developer:

**GitHub Sponsors**: [Sponsor @izdrail](https://github.com/sponsors/izdrail)

Your support helps keep this project maintained and the developer caffeinated. Every contribution, no matter how small, is appreciated and goes toward:
- Keeping the servers running
- Buying coffee (lots of coffee)
- Maintaining dependencies
- Adding new features
- Therapy sessions after debugging Docker issues

## License

Apache 2.0 - Because sharing is caring, but attribution is nice.

## Contact

- **Developer**: Stefan Bogdanel
- **Email**: stefan@izdrail.com
- **Website**: [izdrail.com](https://izdrail.com)
- **This Project**: [jobs.izdrail.com](https://jobs.izdrail.com)

## Final Words

Remember: This project was built with love, caffeine, and an unhealthy amount of Stack Overflow tabs. If it helps you find a job, great! If it doesn't, well, at least you learned something about Docker.

Now go forth and `make build`!

---

*"In Docker we trust, in Make we build, in coffee we survive."* - Ancient Developer Proverb
