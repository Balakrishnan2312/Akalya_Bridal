const mongoose = require('mongoose');

const dressSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Dress name is required'],
      trim: true,
      maxlength: [120, 'Dress name must be 120 characters or fewer']
    },
    price: {
      type: Number,
      required: [true, 'Dress price is required'],
      min: [0, 'Price must be non-negative']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1200, 'Dress description must be 1200 characters or fewer'],
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
    imageData: {
      type: Buffer,
      select: false
    },
    imageContentType: {
      type: String,
      enum: ['', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'],
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
