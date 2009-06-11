use Test::More qw(no_plan);
use OperationHelper;

BEGIN { use_ok( 'Recs::Operation::sort' ) };

my $stream = <<STREAM;
{"foo":3,"zoo":"biz3"}
{"foo":2,"zoo":"biz2"}
{"foo":4,"zoo":"biz4"}
{"foo":5,"zoo":"biz5"}
{"foo":1,"zoo":"biz1"}
STREAM

my $solution = <<SOLUTION;
{"foo":1,"zoo":"biz1"}
{"foo":2,"zoo":"biz2"}
{"foo":3,"zoo":"biz3"}
{"foo":4,"zoo":"biz4"}
{"foo":5,"zoo":"biz5"}
SOLUTION

my $reverse = <<SOLUTION;
{"foo":5,"zoo":"biz5"}
{"foo":4,"zoo":"biz4"}
{"foo":3,"zoo":"biz3"}
{"foo":2,"zoo":"biz2"}
{"foo":1,"zoo":"biz1"}
SOLUTION

OperationHelper->do_match(
   'sort', 
   [qw(--key foo=n)], 
   $stream, 
   $solution
);

OperationHelper->do_match(
   'sort', 
   [qw(--key foo=-n)], 
   $stream, 
   $reverse
);

OperationHelper->do_match(
   'sort', 
   [qw(--key foo=n --reverse)], 
   $stream, 
   $reverse
);

