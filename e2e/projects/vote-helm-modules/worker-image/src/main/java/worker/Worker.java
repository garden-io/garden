package worker;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.exceptions.JedisConnectionException;

import java.io.InputStream;
import java.sql.*;
import java.util.Properties;

import org.json.JSONObject;

class Worker {
  public static void main(String[] args) {
    try {
      Properties props = readEnvProperties();
      Jedis redis = connectToRedis(props);
      Connection dbConn = connectToDB(props);

      System.err.println("Watching vote queue");

      while (true) {
        getVoteFromQueue(dbConn, redis);
      }
    } catch (SQLException e) {
      e.printStackTrace();
      System.exit(1);
    }
  }

  static Properties readEnvProperties() {
    Properties props = new Properties();
    try (InputStream stream = Worker.class.getClassLoader().getResourceAsStream("application.properties")) {
      props.load(stream);
      return props;
    } catch (Exception e) {
      System.err.printf("Error reading application.properties file: " + e);
      throw new RuntimeException(e);
    }
  }

  static void getVoteFromQueue(Connection dbConn, Jedis redis) throws SQLException {
    String voteJSON = redis.blpop(0, "votes").get(1);

    try {
      JSONObject voteData = new JSONObject(voteJSON);
      String voterID = voteData.getString("voter_id");
      String vote = voteData.getString("vote");

      System.err.printf("Processing vote for '%s' by '%s'\n", vote, voterID);
      updateVote(dbConn, voterID, vote);
    } catch (Exception e) {
      System.err.printf("Error when processing vote from queue: " + e);
      return;
    }
  }

  static void updateVote(Connection dbConn, String voterID, String vote) throws SQLException {
    PreparedStatement insert = dbConn.prepareStatement(
      "INSERT INTO votes (id, vote, created_at) VALUES (?, ?, NOW())");
    insert.setString(1, voterID);
    insert.setString(2, vote);

    try {
      insert.executeUpdate();
    } catch (SQLException e) {
      PreparedStatement update = dbConn.prepareStatement(
        "UPDATE votes SET vote = ? WHERE id = ?");
      update.setString(1, vote);
      update.setString(2, voterID);
      update.executeUpdate();
    }
  }

  static Jedis connectToRedis(Properties props) {
    Jedis conn = new Jedis(props.getProperty("redis.host"));

    while (true) {
      try {
        conn.keys("*");
        break;
      } catch (JedisConnectionException e) {
        System.err.println("Waiting for redis");
        sleep(1000);
      }
    }

    System.err.println("Connected to redis");
    return conn;
  }

  static Connection connectToDB(Properties props) throws SQLException {
    Connection conn = null;

    try {
      Class.forName("org.postgresql.Driver");
      String url = "jdbc:postgresql://" + props.get("postgres.host") + '/' + props.get("postgres.db");
      String username = props.getProperty("postgres.username");
      String password = props.getProperty("postgres.password");
      conn = DriverManager.getConnection(url, username, password);
    } catch (ClassNotFoundException e) {
      e.printStackTrace();
      System.exit(1);
    }

    System.err.println("Connected to db");
    return conn;
  }

  static void sleep(long duration) {
    try {
      Thread.sleep(duration);
    } catch (InterruptedException e) {
      System.exit(1);
    }
  }
}
