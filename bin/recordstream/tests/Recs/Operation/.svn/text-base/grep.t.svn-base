use Test::More qw(no_plan);
use OperationHelper;

BEGIN { use_ok( 'Recs::Operation::grep' ) };

my $stream = <<STREAM;
{"foo":1,"zoo":"biz1"}
{"foo":2,"zoo":"biz2"}
{"foo":3,"zoo":"biz3"}
{"foo":4,"zoo":"biz4"}
{"foo":5,"zoo":"biz5"}
STREAM

my $solution = <<SOLUTION;
{"foo":3,"zoo":"biz3"}
{"foo":4,"zoo":"biz4"}
{"foo":5,"zoo":"biz5"}
SOLUTION

OperationHelper->do_match(
   'grep',
   [ '$r->{foo} > 2' ],
   $stream,
   $solution,
);
