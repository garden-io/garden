FROM bitwalker/alpine-elixir-phoenix

ADD ./hello /app
WORKDIR /app

RUN mix deps.get
RUN mix deps.compile
RUN cd assets && npm install && node node_modules/webpack/bin/webpack.js --mode development

WORKDIR /app

CMD ["mix", "phx.server"]
