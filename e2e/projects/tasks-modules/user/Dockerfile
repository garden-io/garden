FROM ruby:2.5

ENV PORT=8084
EXPOSE ${PORT}
WORKDIR /app

ADD Gemfile /app
RUN bundle install

ADD . /app

CMD ["ruby", "app.rb"]
