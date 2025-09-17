# Base image
FROM python:3.11

LABEL maintainer="Stefan Bogdanel <stefan@izdrail.com>"

# Install dependencies
RUN apt update && apt install -y \
    curl \
    nodejs \
    npm \
    net-tools \
    maven \
    chromium \
    && apt-get clean

# Install pip packages and supervisord
RUN pip install --no-cache-dir --upgrade pip \
    && pip install supervisor pipx 

# Install Lighthouse globally
RUN npm install -g lighthouse


WORKDIR /home/osint
# Install Python packages
COPY ./requirements.txt /home/osint/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /home/osint/requirements.txt \
    && pip install pandas python-multipart lighthouse-python-plus sqlalchemy yake fastapi_versioning tls_client uvicorn \
    && python3 -m nltk.downloader -d /usr/local/share/nltk_data wordnet punkt stopwords vader_lexicon \
    && python3 -m textblob.download_corpora


# Customize shell with Zsh
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v1.1.5/zsh-in-docker.sh)" -- \
    -t https://github.com/denysdovhan/spaceship-prompt \
    -a 'SPACESHIP_PROMPT_ADD_NEWLINE="false"' \
    -a 'SPACESHIP_PROMPT_SEPARATE_LINE="false"' \
    -p git \
    -p ssh-agent \
    -p https://github.com/zsh-users/zsh-autosuggestions \
    -p https://github.com/zsh-users/zsh-completions

COPY . .

# Supervisord configuration
COPY docker/supervisord.conf /etc/supervisord.conf


# Expose application port
EXPOSE 8003

# Run application
ENTRYPOINT ["supervisord", "-c", "/etc/supervisord.conf", "-n"]