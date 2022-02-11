/*
A function to represent a queue Created by Kate Morley
Creates a new queue. A queue is a first-in-first-out (FIFO) data structure -
items are added to the end of the queue and removed from the front.
 */
export function Queue(){

  // initialise the queue and offset
  var queue  = [];
  var offset = 0;

  // Returns the length of the queue.
  this.getLength = function(){
    return (queue.length - offset);
  }

  // Returns true if the queue is empty, and false otherwise.
  this.isEmpty = function(){
    return (queue.length === 0);
  }

//Enqueues the specified item.
  this.enqueue = function(item){
    queue.push(item);
  }

//Dequeues an item and returns it. If queue is empty, 'undefined' is returned.
  this.dequeue = function(){
    if (queue.length === 0) return undefined;

    // store the item at the front of the queue
    var item = queue[offset];

    // increment the offset and remove the free space if necessary
    if (++ offset * 2 >= queue.length){
      queue  = queue.slice(offset);
      offset = 0;
    }

    // return the dequeued item
    return item;
  }

//Returns the item at the front of the queue (without dequeuing it). If queue is empty, 'undefined' is returned.
  this.peek = function(){
    return (queue.length > 0 ? queue[offset] : undefined);
  }
}