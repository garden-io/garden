require 'sinatra'
require './user_model.rb'

set :port, ENV['PORT'].to_i

before do
  content_type :json
end

get '/users' do
  {user_names: User.all.map{|u| u.name}}.to_json
end

get '/' do
  redirect '/users'
end
