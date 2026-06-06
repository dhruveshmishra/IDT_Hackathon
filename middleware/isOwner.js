const Item = require('../models/Item');

module.exports = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      req.flash('error', 'Item not found');
      return res.status(404).redirect('back');
    }
    if (item.owner.equals(req.user._id)) {
      return next();
    }
    req.flash('error', 'You can only manage your own listings');
    res.status(403).redirect('back');
  } catch (err) {
    req.flash('error', err.message);
    res.status(500).redirect('back');
  }
};
