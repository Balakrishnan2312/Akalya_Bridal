const mongoose = require('mongoose');

const dressSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Dress name is required'],
      trim: true
    },
    price: {
      type: Number,
      required: [true, 'Dress price is required'],
      min: [0, 'Price must be non-negative']
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    imageUrl: {
      type: String,
      required: [true, 'Dress image URL is required']
    },
    imagePath: {
      type: String,
      default: ''
    },
    isAvailable: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    bufferCommands: false
  }
);

module.exports = mongoose.model('Dress', dressSchema);
