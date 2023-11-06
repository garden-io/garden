use lazy_static::lazy_static;
use std::env::var;

lazy_static! {
    pub static ref GARDEN_SEA_DEBUG: bool = var("GARDEN_SEA_DEBUG").is_ok();
}

macro_rules! debug {
  ($fmt:expr $(, $($arg:tt)*)?) => {
    if *$crate::log::GARDEN_SEA_DEBUG {
      eprintln!(concat!("[garden-sea] debug: ", $fmt), $($($arg)*)?)
    }
  };
}
pub(crate) use debug;
