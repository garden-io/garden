class PopulateUsers < ActiveRecord::Migration[5.2]
  def up
    ["John", "Paul", "George", "Ringo"].each do |name|
      User.create(name: name)
    end
  end

  def down
    User.delete_all
  end
end
